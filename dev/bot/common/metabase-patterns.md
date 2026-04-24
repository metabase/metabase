## Metabase Development Patterns & Gotchas

### REPL Recipes

**Inspect tables**: `(t2/select [:model/Table :id :name :db_id] :db_id 1)`

**Check settings**: `(t2/select-one :model/Setting :key "site-name")`

**Look up field IDs** (needed for MBQL queries):
```clojure
(t2/select [:model/Field :id :name :table_id] :table_id 3)
```

**Run native SQL query**:
```clojure
(require '[metabase.query-processor :as qp])
(qp/process-query {:database 1 :type :native :native {:query "SELECT * FROM ORDERS LIMIT 5"}})
```

**Compile MBQL to SQL** (useful for debugging query generation):
```clojure
(require '[metabase.query-processor.compile :as qp.compile])
(qp.compile/compile {:database 1 :type :query :query {:source-table 1 :filter [:= [:field 1 nil] 42]}})
```

**Pretty-print SQL**: `(dev/pprint-sql {:database 1 :type :query :query {...}})`

**Check permissions**: `(t2/select :model/Permissions :group_id 1)`

### Key test/dev namespaces

Test and dev namespaces are available on the classpath — no manual setup needed:
- `metabase.test` (`mt`) — `mt/user-http-request`, `mt/id`, `mt/with-temp`, `mt/process-query`
- `dev` — `dev/pprint-sql`, `dev/explain-query`, `dev/restart!`

### Common Gotchas

**Card creation**: Never use `t2/insert-returning-instance!` for `:model/Card` — it silently returns `nil` when internal pMBQL validation rejects the query format. Always use `./bin/mage -bot-api-call` or `mt/user-http-request` which give clear error messages on schema violations.

**Feature flag toggle**: `(t2/update! :model/Setting :key "enable-pivoted-filters" {:value "true"})` — may return `0` even when successful. Always verify with `(t2/select-one :model/Setting :key "enable-pivoted-filters")`.

**Visualization settings**: `graph.tooltip_columns` values must use column reference format: `["[\"name\",\"COLUMN_NAME\"]"]`, not bare names.

**Dashboard inline filters**: To configure card-specific inline filters via API, use `PUT /api/dashboard/:id` with `dashcards[].inline_parameters` (array of parameter IDs) and `dashcards[].parameter_mappings`. The parameter must also exist in `dashboard.parameters`.

**Pivot tables**: "Old pivot" = `table.pivot: true` on Table visualization (3-column only). "New pivot" = `PivotTable` visualization type. Separate code paths, separate bugs.

### Server Lifecycle (via REPL)

**Restart the server** (without killing the JVM):
```clojure
;; Full restart — stops web server, reinitializes DB/plugins/scheduler, restarts web server
(dev/restart!)

;; Or step by step:
(dev/stop!)   ; stops Jetty + Malli dev tools
(dev/start!)  ; starts Jetty + runs full init (migrations, plugins, scheduler, etc.)
```

After `(dev/restart!)`, the backend will be temporarily unavailable. Wait for it to come back — poll with `./bin/mage -bot-api-call /api/health` until it succeeds.

**Refresh settings without restart:**
```clojure
(metabase.settings.core/restore-cache!)
```

**When to restart vs refresh:**
- **Setting changed via API/UI**: No restart needed — cache auto-updates
- **Setting changed via env var or directly in the DB**: Use `(metabase.settings.core/restore-cache!)`
- **Code changed that affects initialization** (e.g., startup logic, plugin loading): Use `(dev/restart!)`
- **Need a clean state for testing**: Use `(dev/restart!)`
- **Testing startup behavior** (e.g., what happens on first boot with a new setting): Use `(dev/restart!)`

### H2-Specific Constraints

If the dev environment uses H2 (the default for inline mode):
- Does NOT support `report-timezone`
- Reserves SQL keywords (`value`, `count`, `key`, `type`) as column/alias names — use alternatives
- May reject NULL insertions even after dropping NOT NULL constraints
- No `DATETRUNC()` — use `CAST(col AS DATE)` for date-typed columns
- `FORMATDATETIME()` returns text, not a date type
- In Sample Database, `CATEGORY` is in `PRODUCTS`, not `ORDERS` — join via `PRODUCTS P ON O.PRODUCT_ID = P.ID`
