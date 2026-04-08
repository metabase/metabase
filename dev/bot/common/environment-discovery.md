## Environment Discovery

Ports are configured in `mise.local.toml` at the project root. **Read this file at startup** to discover your ports:

- `MB_JETTY_PORT` — the Metabase backend URL is `http://localhost:$MB_JETTY_PORT`
- `MB_FRONTEND_DEV_PORT` — frontend dev server (hot reload) port
- `NREPL_PORT` — nREPL server port for interactive Clojure evaluation
- The app database port is in the JDBC URL (`MB_DB_CONNECTION_URI`)

**Fallback** (if `mise.local.toml` does not exist): check environment variables directly, then try the defaults: MB_JETTY_PORT=3000, NREPL_PORT=50605.

Do not hardcode or assume any port numbers. Always read from config first.

Always use `http://localhost:$MB_JETTY_PORT` for all API calls and browser navigation — never any other port.
