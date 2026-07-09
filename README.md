# Copa Argentum

Este projeto é um app estático de ranking de agendamentos com suporte a sincronização remota via Supabase.

## Como funciona

- `index.html` exibe a interface
- `script.js` controla o estado, rankings e persistência
- Por padrão ele salva dados no `localStorage` do navegador
- Se você configurar Supabase, ele também tentará carregar e salvar dados remotos

## Configurar Supabase

1. Acesse https://supabase.com e crie uma conta
2. Crie um novo projeto
3. No painel do projeto, copie:
   - `Project URL`
   - `anon public` key
4. Crie a tabela `sdrs` com as colunas abaixo:
   - `id` → `bigint` ou `int8` (Primary Key)
   - `nome` → `text`
   - `time` → `text`
   - `dia` → `integer`
   - `semana` → `integer`
   - `mes` → `integer`

## Permissões

Para teste rápido, desative `Row Level Security` na tabela `sdrs`.

Se quiser publicar com segurança, crie policies para permitir `SELECT`, `INSERT` e `UPDATE` para `auth.role() = 'anon'`.

## Configurar o Supabase no app

O app agora lê o `Project URL` e a `anon public key` diretamente do formulário dentro de `index.html`.

1. Abra a página no navegador.
2. Insira o `Project URL` e a `anon public key` no painel de configuração do Supabase.
3. Clique em `Salvar Supabase`.

Os valores são salvos no `localStorage` do navegador e usados para ativar a sincronização remota.

## Deploy

Você já está usando Vercel. Basta subir os arquivos (`index.html`, `script.js`, `style.css`) no repositório e redeploy.

## Comportamento esperado

- Se o Supabase estiver configurado corretamente, o app tenta carregar dados remotos
- Se não estiver configurado, ele continua funcionando com `localStorage`
- Após atualizar os dados, ele ainda guarda localmente e tenta enviar para o Supabase quando disponível

## Observações

Se quiser, posso te ajudar a criar a tabela e as policies no Supabase passo a passo.
