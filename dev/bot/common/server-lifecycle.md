## Server Lifecycle (via REPL)

Use the `/clojure-eval` skill for all REPL operations below.

### Restart the server (without killing the JVM)

```clojure
;; Full restart — stops web server, reinitializes DB/plugins/scheduler, restarts web server
(dev/restart!)

;; Or step by step:
(dev/stop!)   ; stops Jetty + Malli dev tools
(dev/start!)  ; starts Jetty + runs full init (migrations, plugins, scheduler, etc.)
```

After `(dev/restart!)`, the backend will be temporarily unavailable. Wait for it to come back before continuing — poll with `./bin/mage -bot-api-call /api/health` or `(require '[metabase.server.instance :as server]) (server/instance)` until it returns non-nil.

### Refresh settings without restart

```clojure
;; Force-reload all settings from the database (e.g., after changing a setting via SQL or env var)
(metabase.settings.core/restore-cache!)
```

### When to restart vs refresh
- **Setting changed via API/UI**: No restart needed — cache auto-updates
- **Setting changed via env var or directly in the DB**: Use `(metabase.settings.core/restore-cache!)`
- **Code changed that affects initialization** (e.g., startup logic, plugin loading): Use `(dev/restart!)`
- **Need a clean state for testing**: Use `(dev/restart!)`
- **Testing startup behavior** (e.g., what happens on first boot with a new setting): Use `(dev/restart!)`
