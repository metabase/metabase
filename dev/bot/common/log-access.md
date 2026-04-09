## Log Access

### View and capture logs (REPL)

```clojure
(require '[metabase.logger.core :as logger])
(logger/messages)                                         ;; last 250 log entries
(logger/set-ns-log-level! 'metabase.some-ns :debug)       ;; increase verbosity
(logger/set-ns-log-level! 'metabase.some-ns :info)        ;; reset
```

Levels (least→most verbose): `:off` `:fatal` `:error` `:warn` `:info` `:debug` `:trace`

Or via API: `./bin/mage -bot-api-call /api/logger/logs --api-key $ADMIN_API_KEY`

**Workflow:** Set debug level → reproduce issue → capture logs → reset level.

Save logs as evidence:
```clojure
(spit "{{OUTPUT_DIR}}/output/server-logs-CONTEXT.txt"
      (->> (logger/messages)
           (map #(str (:timestamp %) " " (:level %) " [" (:fqns %) "] " (:msg %)))
           (clojure.string/join "\n")))
```
