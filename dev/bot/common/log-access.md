## Log Access

### View recent logs (REPL)

```clojure
;; Get last 250 log entries as structured data
(require '[metabase.logger.core :as logger])
(logger/messages)
```

Each entry is a map with keys: `:timestamp`, `:level`, `:fqns` (namespace), `:msg`, `:exception` (vector of stack frames).

### Adjust log level for deeper investigation

```clojure
;; Increase verbosity for a namespace (useful before reproducing an issue)
(logger/set-ns-log-level! 'metabase.query-processor :debug)

;; Check current level
(logger/ns-log-level 'metabase.query-processor)

;; Reset to default
(logger/set-ns-log-level! 'metabase.query-processor :info)
```

Available levels (least to most verbose): `:off`, `:fatal`, `:error`, `:warn`, `:info`, `:debug`, `:trace`

### View logs via API

```bash
./bin/mage -bot-api-call /api/logger/logs --api-key $ADMIN_API_KEY
```

### Capture logs as evidence

Save log output to the output directory using the REPL:

```clojure
;; Save all recent logs
(spit "OUTPUT_PATH/server-logs-CONTEXT.txt"
      (with-out-str
        (doseq [entry (logger/messages)]
          (println (:timestamp entry) (:level entry) (:fqns entry))
          (println "  " (:msg entry))
          (when (:exception entry)
            (doseq [frame (:exception entry)]
              (println "  " frame))))))
```

Filter logs for a specific namespace or pattern:

```clojure
;; Capture only logs matching a pattern
(spit "OUTPUT_PATH/server-logs-CONTEXT.txt"
      (->> (logger/messages)
           (filter #(re-find #"pattern-here" (str (:fqns %) " " (:msg %))))
           (map #(str (:timestamp %) " " (:level %) " [" (:fqns %) "] " (:msg %)))
           (clojure.string/join "\n")))
```

Replace `OUTPUT_PATH` with the actual output directory path (e.g., `.qabot/branch/timestamp/output`).

### Recommended workflow for log-based investigation

1. **Before reproducing**: Increase log level for the relevant namespace
2. **Reproduce the issue** via API call, Playwright, or REPL
3. **Capture the logs** to the output directory
4. **Reset log level** back to `:info` to avoid noise

### Workmux mode log files

In workmux mode, backend stdout is piped to log files:
```bash
ls -t .qabot/backend-*.log | head -1    # find latest log file
tail -200 <file>                         # view recent output
grep -i "error\|warn\|exception" <file>  # search for problems
```
