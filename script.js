      // --- DATA STORE ---
        let theme = 'dark';
        let viewMode = 'Operacao';

        let sdrs = [];
        let history = { daily: [], weekly: [], monthly: [] };
        let currentKeys = { day: '', week: '', month: '' };
        let managerAuthenticated = false;

        // --- CONFIGURAÇÃO SUPABASE ---
        // Credenciais fixas do projeto: todo aparelho carrega já sincronizado,
        // sem precisar preencher o formulário manualmente em cada navegador.
        // A anon key é segura para expor no client-side; a proteção real vem das
        // policies de Row Level Security configuradas no Supabase.
        const DEFAULT_SUPABASE_URL = 'https://nboidasmhiotykcntfoo.supabase.co';
        const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ib2lkYXNtaGlvdHlrY250Zm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTQ1NDMsImV4cCI6MjA5ODU5MDU0M30.nVil3EIaXFCzpHs_oJPvY1IzUDrXodWniKqnD_5reuE';

        let supabaseUrl = localStorage.getItem('ca_supabase_url') || DEFAULT_SUPABASE_URL;
        let supabaseAnonKey = localStorage.getItem('ca_supabase_key') || DEFAULT_SUPABASE_KEY;
        let REMOTE_ENABLED = false;
        let supabaseClient = null;
        let syncError = '';
        let pollIntervalId = null;
        const POLL_INTERVAL_MS = 6000;

        function loadLocalData() {
            sdrs = JSON.parse(localStorage.getItem('ca_sdrs') || '[]').map(normalizeSdr);
            history = JSON.parse(localStorage.getItem('ca_history') || '{"daily":[],"weekly":[],"monthly":[]}');
            currentKeys = JSON.parse(localStorage.getItem('ca_periodKeys') || '{}');

            const today = getDateKeys();
            currentKeys.day = currentKeys.day || today.day;
            currentKeys.week = currentKeys.week || today.week;
            currentKeys.month = currentKeys.month || today.month;
        }

        async function loadRemoteData() {
            if (!REMOTE_ENABLED || !supabaseClient) return false;
            syncError = '';
            try {
                const { data, error } = await supabaseClient.from('sdrs').select('*');
                if (error) throw error;
                if (Array.isArray(data)) {
                    sdrs = data.map(normalizeSdr);
                    localStorage.setItem('ca_sdrs', JSON.stringify(sdrs));
                }
                return true;
            } catch (err) {
                syncError = err.message || String(err);
                console.error('Supabase load failed:', syncError);
            }
            return false;
        }

        async function loadData() {
            loadLocalData();
            if (REMOTE_ENABLED) {
                const loaded = await loadRemoteData();
                if (!loaded) {
                    console.warn('Usando dados locais; configure Supabase para sincronização em nuvem. Erro:', syncError);
                }
            }

            const today = getDateKeys();
            currentKeys.day = currentKeys.day || today.day;
            currentKeys.week = currentKeys.week || today.week;
            currentKeys.month = currentKeys.month || today.month;

            const resetApplied = applyPeriodResets(today);
            if (resetApplied) {
                saveData();
            }
            updateSyncStatus();
        }

        function saveData() {
            localStorage.setItem('ca_sdrs', JSON.stringify(sdrs));
            localStorage.setItem('ca_history', JSON.stringify(history));
            localStorage.setItem('ca_periodKeys', JSON.stringify(currentKeys));
            if (REMOTE_ENABLED) {
                saveRemoteData();
            }
        }

        async function saveRemoteData() {
            if (!REMOTE_ENABLED || !supabaseClient) return;
            try {
                const { error } = await supabaseClient.from('sdrs').upsert(sdrs, { onConflict: 'id' });
                if (error) throw error;
            } catch (err) {
                console.error('Supabase save failed:', err.message || err);
            }
        }

        function updateSyncStatus() {
            const status = document.getElementById('sync-status');
            if (!status) return;

            if (!REMOTE_ENABLED) {
                status.textContent = 'Sincronização remota desativada.';
                status.className = 'text-xs text-amber-300';
            } else if (syncError) {
                status.textContent = `Erro na sincronização: ${syncError}`;
                status.className = 'text-xs text-red-400';
            } else {
                status.textContent = 'Sincronização remota habilitada.';
                status.className = 'text-xs text-emerald-400';
            }
            status.classList.remove('hidden');
        }

        function populateSupabaseConfigUI() {
            const urlInput = document.getElementById('supabase-url');
            const keyInput = document.getElementById('supabase-key');
            if (urlInput) urlInput.value = localStorage.getItem('ca_supabase_url') || '';
            if (keyInput) keyInput.value = localStorage.getItem('ca_supabase_key') || '';
        }

        function normalizeSupabaseUrl(rawUrl) {
            if (!rawUrl) return DEFAULT_SUPABASE_URL;
            let url = rawUrl.trim();
            url = url.replace(/\/+$/, '');
            if (url.includes('/rest/v1')) {
                url = url.split('/rest/v1')[0];
            }
            return url;
        }

        function getQueryParam(name) {
            const params = new URLSearchParams(window.location.search);
            return params.get(name) ? params.get(name).trim() : '';
        }

        function loadSupabaseConfigFromQuery() {
            const url = getQueryParam('supabaseUrl');
            const key = getQueryParam('supabaseKey');
            const override = getQueryParam('override') === 'true';
            if (!url || !key) return;
            const savedUrl = localStorage.getItem('ca_supabase_url') || '';
            const savedKey = localStorage.getItem('ca_supabase_key') || '';
            if (override || !savedUrl || !savedKey) {
                configureSupabase(url, key);
                // After configuring from query params, try to load remote data immediately
                loadData().then(() => renderAll());
            }
        }

        function applySupabaseQuery() {
            const url = getQueryParam('supabaseUrl');
            const key = getQueryParam('supabaseKey');
            if (!url || !key) {
                alert('Nenhum parâmetro supabaseUrl/supabaseKey na URL.');
                return;
            }
            configureSupabase(url, key);
            loadData().then(() => {
                renderAll();
                alert('Configuração Supabase aplicada a partir da query string.');
            });
        }

        function configureSupabase(url, key) {
            const normalizedUrl = normalizeSupabaseUrl(url || localStorage.getItem('ca_supabase_url') || DEFAULT_SUPABASE_URL);
            supabaseUrl = normalizedUrl;
            supabaseAnonKey = key || localStorage.getItem('ca_supabase_key') || DEFAULT_SUPABASE_KEY;
            localStorage.setItem('ca_supabase_url', supabaseUrl);
            localStorage.setItem('ca_supabase_key', supabaseAnonKey);
            REMOTE_ENABLED = Boolean(supabaseUrl && supabaseAnonKey);
            supabaseClient = REMOTE_ENABLED ? supabase.createClient(supabaseUrl, supabaseAnonKey) : null;
            populateSupabaseConfigUI();
            updateSyncStatus();
            startPolling();
        }

        function startPolling() {
            if (pollIntervalId) {
                clearInterval(pollIntervalId);
                pollIntervalId = null;
            }
            if (!REMOTE_ENABLED) return;
            pollIntervalId = setInterval(async () => {
                const loaded = await loadRemoteData();
                if (loaded) {
                    renderAll();
                    updateSyncStatus();
                }
            }, POLL_INTERVAL_MS);
        }

        async function handleSupabaseConfig(e) {
            e.preventDefault();
            const url = document.getElementById('supabase-url').value.trim();
            const key = document.getElementById('supabase-key').value.trim();
            if (!url || !key) {
                return alert('Preencha o URL e a chave do Supabase.');
            }
            configureSupabase(url, key);
            loadData().then(() => renderAll());
            alert('Supabase configurado com sucesso.');
        }

        configureSupabase();
        loadSupabaseConfigFromQuery();
        populateSupabaseConfigUI();

        // --- THEME ENGINE ---
        function toggleTheme() {
            theme = theme === 'dark' ? 'light' : 'dark';
            const body = document.getElementById('body-ctx');
            const header = document.getElementById('header-ctx');
            const cards = document.querySelectorAll('.card-bg');
            const selectInputs = document.querySelectorAll('.select-input-bg');

            if (theme === 'light') {
                body.className = "bg-slate-50 text-slate-900 min-h-screen antialiased transition-colors duration-200";
                header.className = "border-b border-slate-200 bg-white sticky top-0 z-40 px-6 py-4";
                cards.forEach(c => c.classList.replace('bg-slate-900', 'bg-white'));
                cards.forEach(c => c.classList.replace('border-slate-800', 'border-slate-200'));
                selectInputs.forEach(si => si.classList.replace('bg-slate-950', 'bg-slate-50'));
                selectInputs.forEach(si => si.classList.replace('border-slate-800', 'border-slate-300'));
                document.getElementById('theme-toggle').className = "p-2 rounded-lg border bg-white border-slate-300 text-slate-700";
            } else {
                body.className = "bg-slate-950 text-slate-100 min-h-screen antialiased transition-colors duration-200";
                header.className = "border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-40 px-6 py-4";
                cards.forEach(c => c.classList.replace('bg-white', 'bg-slate-900'));
                cards.forEach(c => c.classList.replace('border-slate-200', 'border-slate-800'));
                selectInputs.forEach(si => si.classList.replace('bg-slate-50', 'bg-slate-950'));
                selectInputs.forEach(si => si.classList.replace('border-slate-300', 'border-slate-800'));
                document.getElementById('theme-toggle').className = "p-2 rounded-lg border bg-slate-900 border-slate-700 text-amber-400";
            }
        }

        // --- NAVIGATION ENGINE ---
        function setViewMode(mode) {
            viewMode = mode;
            document.getElementById('view-operacao').classList.add('hidden');
            document.getElementById('view-tv').classList.add('hidden');
            document.getElementById('view-history').classList.add('hidden');
            document.getElementById('view-gestao').classList.add('hidden');

            document.getElementById('btn-op').className = "px-3 py-1.5 rounded-md transition text-slate-400";
            document.getElementById('btn-tv').className = "px-3 py-1.5 rounded-md transition flex items-center gap-1 text-slate-400";
            document.getElementById('btn-hist').className = "px-3 py-1.5 rounded-md transition text-slate-400";
            document.getElementById('btn-gest').className = "px-3 py-1.5 rounded-md transition text-slate-400";

            if (mode === 'Operacao') {
                document.getElementById('view-operacao').classList.remove('hidden');
                document.getElementById('btn-op').className = "px-3 py-1.5 rounded-md transition bg-slate-300 text-slate-950 font-bold";
            } else if (mode === 'TV') {
                document.getElementById('view-tv').classList.remove('hidden');
                document.getElementById('btn-tv').className = "px-3 py-1.5 rounded-md transition flex items-center gap-1 bg-slate-300 text-slate-950 font-bold";
            } else if (mode === 'Historico') {
                document.getElementById('view-history').classList.remove('hidden');
                document.getElementById('btn-hist').className = "px-3 py-1.5 rounded-md transition bg-slate-300 text-slate-950 font-bold";
            } else if (mode === 'Gestao') {
                document.getElementById('view-gestao').classList.remove('hidden');
                document.getElementById('btn-gest').className = "px-3 py-1.5 rounded-md transition bg-slate-300 text-slate-950 font-bold";
            }
            renderAll();
        }

        // --- LEADS CORE ACTIONS ---
        // Gera um ID determinístico a partir do nome do assessor. Isso garante que,
        // se dois aparelhos criarem o mesmo assessor antes de sincronizar, o upsert
        // no Supabase (onConflict: 'id') funda os registros em vez de duplicá-los.
        function idFromNome(nome) {
            const str = (nome || '').trim().toLowerCase();
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
            }
            return hash;
        }

        function normalizeSdr(s) {
            return {
                id: s.id || idFromNome(s.nome),
                nome: s.nome || 'Sem nome',
                time: s.time || 'Sem time',
                dia: Number(s.dia) || 0,
                semana: Number(s.semana) || 0,
                mes: Number(s.mes) || 0
            };
        }

        function getOrCreateSdr(nome, time) {
            const trimmedName = nome.trim();
            const trimmedTime = time.trim();
            if (!trimmedName) return null;

            let existing = sdrs.find(s => s.nome.toLowerCase() === trimmedName.toLowerCase());
            if (existing) {
                existing.time = trimmedTime || existing.time;
                return existing;
            }

            const novoSdr = normalizeSdr({ id: idFromNome(trimmedName), nome: trimmedName, time: trimmedTime || 'Sem time', dia: 0, semana: 0, mes: 0 });
            sdrs.unshift(novoSdr);
            return novoSdr;
        }

        function handleAddLeads(e) {
            e.preventDefault();
            const sdrName = document.getElementById('lead-sdr-input').value;
            const teamName = document.getElementById('lead-team-input').value;
            const qty = Number(document.getElementById('lead-qty').value);

            if(!sdrName.trim()) return alert('Por favor informe o nome do assessor.');
            if(!teamName.trim()) return alert('Por favor informe o time do assessor.');
            if(!qty || qty < 1) return alert('Informe um número válido de agendamentos.');

            const assessor = getOrCreateSdr(sdrName, teamName);
            if (!assessor) return;

            assessor.dia += qty;
            assessor.semana += qty;
            assessor.mes += qty;

            saveData();
            renderAll();
            document.getElementById('form-leads').reset();
        }

        function getDateKeys() {
            const now = new Date();
            const day = now.toISOString().slice(0,10);
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const week = getWeekKey(now);
            return { day, week, month };
        }

        function getWeekKey(date) {
            const copy = new Date(date);
            const day = copy.getDay();
            const diff = (5 - day + 7) % 7;
            copy.setDate(copy.getDate() + diff);
            return copy.toISOString().slice(0,10);
        }

        function archivePeriod(period, key, countKey) {
            const snapshot = sdrs
                .filter(s => s[countKey] > 0)
                .map(s => ({ nome: s.nome, time: s.time, count: s[countKey] }))
                .sort((a, b) => b.count - a.count);

            if (!snapshot.length) return;

            const label = period === 'daily'
                ? key
                : period === 'weekly'
                ? `Semana até ${key}`
                : key;

            history[period].unshift({ key, label, items: snapshot });
            if (history[period].length > 20) history[period].splice(20);
        }

        function applyPeriodResets(today) {
            let changed = false;
            if (currentKeys.day !== today.day) {
                archivePeriod('daily', currentKeys.day, 'dia');
                sdrs.forEach(s => s.dia = 0);
                currentKeys.day = today.day;
                changed = true;
            }
            if (currentKeys.week !== today.week) {
                archivePeriod('weekly', currentKeys.week, 'semana');
                sdrs.forEach(s => s.semana = 0);
                currentKeys.week = today.week;
                changed = true;
            }
            if (currentKeys.month !== today.month) {
                archivePeriod('monthly', currentKeys.month, 'mes');
                sdrs.forEach(s => s.mes = 0);
                currentKeys.month = today.month;
                changed = true;
            }
            return changed;
        }

        function renderHistoryList(containerId, entries, emptyText) {
            const container = document.getElementById(containerId);
            if (!entries.length) {
                container.innerHTML = `<p class="text-sm text-slate-400">${emptyText}</p>`;
                return;
            }

            container.innerHTML = entries.map(entry => `
                <div class="p-4 rounded-2xl border border-slate-800 bg-slate-950/70 space-y-3">
                    <div class="flex justify-between text-sm text-slate-300">
                        <span>${entry.label}</span>
                        <span>${entry.items.length} assessores</span>
                    </div>
                    <div class="space-y-2">
                        ${entry.items.slice(0, 5).map((item, i) => `
                            <div class="flex justify-between text-sm text-slate-200">
                                <span>${i + 1}º ${item.nome} <span class="text-slate-400">(${item.time})</span></span>
                                <span class="font-bold text-blue-400">${item.count} agend.</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        function renderHistory() {
            renderHistoryList('history-daily', history.daily, 'Sem histórico diário ainda.');
            renderHistoryList('history-weekly', history.weekly, 'Sem histórico semanal ainda.');
            renderHistoryList('history-monthly', history.monthly, 'Sem histórico mensal ainda.');
        }

        function handleManageLogin(e) {
            e.preventDefault();
            const pass = document.getElementById('manage-pass').value.trim();
            if (pass === '123456') {
                managerAuthenticated = true;
                document.getElementById('form-gestao-login').classList.add('hidden');
                document.getElementById('gestao-panel').classList.remove('hidden');
                renderManagement();
                return;
            }
            alert('Senha incorreta.');
        }

        function handleManageLogout() {
            managerAuthenticated = false;
            document.getElementById('form-gestao-login').classList.remove('hidden');
            document.getElementById('gestao-panel').classList.add('hidden');
            document.getElementById('form-gestao-login').reset();
        }

        function adjustSdrCount(nome, field, delta) {
            const assessor = sdrs.find(s => s.nome.toLowerCase() === nome.toLowerCase());
            if (!assessor) return;
            assessor[field] = Math.max(0, assessor[field] + delta);
            saveData();
            renderAll();
            renderManagement();
        }

        function removeSdr(nome) {
            sdrs = sdrs.filter(s => s.nome.toLowerCase() !== nome.toLowerCase());
            saveData();
            renderAll();
            renderManagement();
        }

        function setSdrCount(nome, field, value) {
            const assessor = sdrs.find(s => s.nome.toLowerCase() === nome.toLowerCase());
            if (!assessor) return;
            assessor[field] = Math.max(0, Number(value) || 0);
            saveData();
            renderAll();
            renderManagement();
        }

        function renderManagement() {
            if (!managerAuthenticated) return;
            const container = document.getElementById('management-list');
            if (!container) return;

            const sorted = [...sdrs].sort((a, b) => b.mes - a.mes);
            container.innerHTML = sorted.map(s => `
                <div class="p-4 rounded-2xl border border-slate-800 bg-slate-950/80 text-slate-200">
                    <div class="flex items-center justify-between gap-4 mb-3">
                        <div>
                            <div class="font-bold text-slate-100">${s.nome}</div>
                            <div class="text-xs text-slate-400">${s.time}</div>
                        </div>
                        <button onclick="removeSdr('${s.nome}')" class="text-red-400 hover:text-red-300 text-xs font-semibold">Excluir assessor</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/90">
                            <div class="text-slate-400 mb-2">Diário</div>
                            <div class="font-bold text-slate-100 mb-2">${s.dia}</div>
                            <div class="flex gap-2 mb-2">
                                <button onclick="adjustSdrCount('${s.nome}', 'dia', -1)" class="flex-1 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600">Remover 1</button>
                                <button onclick="adjustSdrCount('${s.nome}', 'dia', -s.dia)" class="flex-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold hover:bg-red-600">Zerar</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <input id="input-dia-${s.id}" type="number" min="0" value="${s.dia}" class="w-full rounded-xl p-2 border border-slate-700 bg-slate-950 text-xs text-slate-100" />
                                <button onclick="setSdrCount('${s.nome}', 'dia', document.getElementById('input-dia-${s.id}').value)" class="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400">Salvar</button>
                            </div>
                        </div>
                        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/90">
                            <div class="text-slate-400 mb-2">Semanal</div>
                            <div class="font-bold text-slate-100 mb-2">${s.semana}</div>
                            <div class="flex gap-2 mb-2">
                                <button onclick="adjustSdrCount('${s.nome}', 'semana', -1)" class="flex-1 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600">Remover 1</button>
                                <button onclick="adjustSdrCount('${s.nome}', 'semana', -s.semana)" class="flex-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold hover:bg-red-600">Zerar</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <input id="input-semana-${s.id}" type="number" min="0" value="${s.semana}" class="w-full rounded-xl p-2 border border-slate-700 bg-slate-950 text-xs text-slate-100" />
                                <button onclick="setSdrCount('${s.nome}', 'semana', document.getElementById('input-semana-${s.id}').value)" class="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400">Salvar</button>
                            </div>
                        </div>
                        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/90">
                            <div class="text-slate-400 mb-2">Mensal</div>
                            <div class="font-bold text-slate-100 mb-2">${s.mes}</div>
                            <div class="flex gap-2 mb-2">
                                <button onclick="adjustSdrCount('${s.nome}', 'mes', -1)" class="flex-1 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600">Remover 1</button>
                                <button onclick="adjustSdrCount('${s.nome}', 'mes', -s.mes)" class="flex-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold hover:bg-red-600">Zerar</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <input id="input-mes-${s.id}" type="number" min="0" value="${s.mes}" class="w-full rounded-xl p-2 border border-slate-700 bg-slate-950 text-xs text-slate-100" />
                                <button onclick="setSdrCount('${s.nome}', 'mes', document.getElementById('input-mes-${s.id}').value)" class="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function incrementSdr(nome) {
            const assessor = sdrs.find(s => s.nome.toLowerCase() === nome.toLowerCase());
            if (!assessor) return;

            assessor.dia += 1;
            assessor.semana += 1;
            assessor.mes += 1;

            saveData();
            renderAll();
        }

        // --- RENDER DYNAMICS ---
        function getPerformanceColor(leads) {
            if (leads >= 7) return 'text-green-500 bg-green-500/10 border-green-500/20';
            if (leads >= 4) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            return 'text-red-500 bg-red-500/10 border-red-500/20';
        }

        function renderRankingRows(container, items, countKey, countLabelClass, defaultRowClass = 'border border-slate-800 bg-slate-950/40 text-slate-200', usePerformanceColor = false) {
            container.innerHTML = '';
            items.forEach((s, i) => {
                const count = s[countKey];
                const rowClass = usePerformanceColor ? getPerformanceColor(count) : defaultRowClass;

                container.innerHTML += `
                    <div class="flex justify-between items-center p-3 rounded-xl ${rowClass}">
                        <span class="font-medium text-sm">${i+1}º ${s.nome} <span class="text-slate-400">(${s.time})</span></span>
                        <div class="flex items-center gap-2">
                            <button onclick="incrementSdr('${s.nome}')" class="rounded-full bg-slate-300/90 text-slate-950 px-2.5 py-1 text-xs font-bold hover:bg-slate-400">+1</button>
                            <span class="font-bold ${countLabelClass}">${count} agend.</span>
                        </div>
                    </div>`;
            });
        }

        function renderAll() {
            const today = getDateKeys();
            if (applyPeriodResets(today)) {
                saveData();
            }

            const query = document.getElementById('search-input').value.toLowerCase();
            const filteredSdrs = sdrs.filter(s => s.nome.toLowerCase().includes(query));

            const rDiario = [...filteredSdrs].sort((a,b) => b.dia - a.dia);
            const rSemanal = [...filteredSdrs].sort((a,b) => b.semana - a.semana);
            const rMensal = [...filteredSdrs].sort((a,b) => b.mes - a.mes);

            renderRankingRows(document.getElementById('ranking-diario'), rDiario, 'dia', 'text-sm', '', true);
            renderRankingRows(document.getElementById('ranking-semanal'), rSemanal, 'semana', 'text-sm text-orange-400');
            renderRankingRows(document.getElementById('ranking-mensal'), rMensal, 'mes', 'text-sm text-blue-400');

            document.getElementById('tv-diario').innerHTML = document.getElementById('ranking-diario').innerHTML;
            document.getElementById('tv-semanal').innerHTML = document.getElementById('ranking-semanal').innerHTML;
            document.getElementById('tv-mensal').innerHTML = document.getElementById('ranking-mensal').innerHTML;

            const teamTotals = filteredSdrs.reduce((acc, s) => {
                const team = s.time || 'Sem time';
                acc[team] = (acc[team] || 0) + s.mes;
                return acc;
            }, {});

            const teamRanking = Object.entries(teamTotals)
                .map(([team, total]) => ({ team, total }))
                .sort((a, b) => b.total - a.total);

            const teamContainer = document.getElementById('team-ranking');
            teamContainer.innerHTML = '';
            teamRanking.forEach((team, index) => {
                teamContainer.innerHTML += `
                    <div class="flex justify-between items-center p-3 rounded-xl border border-slate-800 bg-slate-950/40 text-slate-200">
                        <span class="font-medium text-sm">${index + 1}º ${team.team}</span>
                        <span class="font-bold text-sm text-blue-400">${team.total} agend.</span>
                    </div>`;
            });

            if (viewMode === 'Historico') {
                renderHistory();
            }
        }

async function initApp() {
            await loadData();
            renderAll();
        }

        // Initial Load
        initApp();