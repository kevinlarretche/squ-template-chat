# Chat security

The production site serves `public/` and sends messages to the same-origin `/api/chat` Vercel function. The function owns conversation identifiers and signs a Secure, HttpOnly, SameSite=Strict cookie expiring after one day. Client-supplied chat IDs are ignored. Requests require the production origin, JSON, and a message of at most 2,000 characters.

Production environment variables are `SQU_SESSION_KEY`, `SQU_GATEWAY_KEY`, and `SQU_CHAT_KIND=brand`. Keep keys in Vercel secrets; never put them in browser code. The n8n Security gate stores only the gateway key's SHA-256 digest. Direct public webhook requests without the key are rejected.

n8n atomically enforces 10 requests per session per minute, 30 per hashed IP per minute, and 1,000 requests per demo per UTC day in `public.chat_rate_limits`. The application caps AI traffic; this is not infrastructure-level DDoS protection. Rate-limit counters contain hashed IPs rather than raw addresses. Production workflow payload retention is disabled.

All user-dependent SQL uses positional parameters. Conversation, session, analytics, catalogue, and rate-limit tables have RLS enabled and no anon/authenticated grants. The n8n Postgres credential retains its existing privileged role; moving to a dedicated least-privilege account is a separate recommended infrastructure change.

Message text is HTML-escaped and allows only basic bold/code formatting; arbitrary Markdown links remain text. Product links accept HTTPS only. CSP restricts scripts to hashes of the shipped script, blocks inline handlers, and restricts network connections to the same origin.

Verification on 2026-10-02: anonymous database permissions denied; both direct webhooks returned 403; normal proxy requests returned 200; a pre-exhausted test rate bucket returned 429 before AI processing; both browser chats worked, including Aura's image card and a distributor follow-up; local tests covered cookie tampering, client chat-ID spoofing, foreign origins, oversized inputs, hostile Markdown, and parameterized workflow SQL.

Old workflow exports and historical execution records may contain legacy API keys and conversations. Do not publish exports. This release does not rotate external provider credentials or erase historical records. Future changes to inline JavaScript must regenerate the CSP hash in `vercel.json`.
