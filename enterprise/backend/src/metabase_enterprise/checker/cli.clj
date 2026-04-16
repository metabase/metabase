(ns metabase-enterprise.checker.cli
  "CLI entrypoint for the checker module.

   Invoked from metabase.core.bootstrap:
     java -jar metabase.jar --mode checker --export /path/to/export --schema-dir /path/to/schemas"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.checker.semantic :as checker]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:discouraged-var]}
(def output!
  "Alias for println so can suppress warning in one place"
  println)

(defn- fail!
  "Print error message to stderr and exit with code 1."
  [& messages]
  (binding [*out* *err*]
    (doseq [msg messages]
      (output! msg)))
  (flush)
  (System/exit 1))

(defn- validate-directory!
  "Validate that path exists and is a directory. Exits on failure."
  [path]
  (let [f (io/file path)]
    (cond
      (not (.exists f))
      (fail! (str "Directory does not exist: " path))

      (not (.isDirectory f))
      (fail! (str "Not a directory: " path)))))

(defn- validate-path!
  "Validate that path exists (file or directory). Exits on failure."
  [path]
  (let [f (io/file path)]
    (when-not (.exists f)
      (fail! (str "Path does not exist: " path)))))

(defn- run-checker
  "Run the semantic checker."
  [export-dir {:keys [output errors-only schema-dir schema-format]}]
  (when-not schema-dir
    (fail! "Missing --schema-dir option"))
  (validate-path! schema-dir)
  (let [fmt (case schema-format
              "concise" :concise
              "serdes"  :serdes
              nil       :serdes
              (fail! (str "Unknown --schema-format: " schema-format
                          " (must be 'serdes' or 'concise')")))
        {:keys [results]} (try
                            (checker/check export-dir schema-dir nil {:schema-format fmt})
                            (catch clojure.lang.ExceptionInfo e
                              (fail! (.getMessage e))))
        summary  (checker/summarize-results results)
        failures (filter #(not= :ok (checker/result-status (second %))) results)]
    (if errors-only
      ;; Errors-only mode: just errors to stdout, nothing else
      (doseq [entry (sort-by (comp :name second) failures)
              :let [error-str (checker/format-error entry)]
              :when error-str]
        #_{:clj-kondo/ignore [:discouraged-var]}
        (output! error-str))
      ;; Normal mode: full output
      (do
        ;; Write to output file if specified
        (when output
          (spit output (pr-str results))
          (output! "Results written to:" output))
        ;; Print summary
        (output! "Semantic Check Results")
        (output! "=====================")
        (output! "Total entities:"      (:total summary))
        (output! "  OK:"                (:ok summary))
        (output! "  Errors:"            (:errors summary))
        (output! "  Unresolved refs:"   (:unresolved summary))
        (output! "  Native SQL errors:" (:native-errors summary))
        (output! "  Issues:"            (:issues summary))
        ;; Print failures
        (when (seq failures)
          (output! "\nFailures:")
          (output! "---------")
          (doseq [entry (sort-by (comp :name second) failures)]
            (output!)
            (output! (checker/format-result entry))))))
    ;; Exit with appropriate code
    (flush)
    (System/exit (if (zero? (+ (:errors summary) (:unresolved summary)
                               (:native-errors summary) (:issues summary)))
                   0
                   1))))

(def ^:private cli-spec
  "CLI options for checker mode."
  [[nil "--mode MODE" "Mode (handled by bootstrap, included here for completeness)"]
   [nil "--export PATH" "Path to serdes export directory"]
   [nil "--schema-dir PATH" "Path to schema source (directory for serdes, JSON file for concise)"]
   [nil "--schema-format FMT" "Schema format: 'serdes' (default) or 'concise'"]
   [nil "--output PATH" "Path to output file for results"]
   [nil "--errors-only" "Output only errors to stdout (concise format for LLM consumption)"]
   ["-h" "--help" "Show this help"]])

(defn- usage [summary]
  (str "Usage: java -jar metabase.jar --mode checker [options]\n\n"
       "Options:\n"
       summary))

(defn entrypoint
  "Main entrypoint for checker mode. Receives raw args. Intended to enter from
  metabase.core.bootstrap/run-standalone-mode so that it can skip loading everything that
  metabase.core.core/entrypoint loads. This entrypoint owns the process and will call System/exit."
  [args]
  (let [{:keys [options errors summary]} (cli/parse-opts args cli-spec)
        {:keys [export help]} options]
    (cond
      help
      (do (output! (usage summary))
          (System/exit 0))

      errors
      (fail! (str "Error parsing arguments:\n" (str/join "\n" errors))
             ""
             (usage summary))

      (not export)
      (fail! "Missing --export option"
             ""
             (usage summary))

      :else
      (do
        (validate-directory! export)
        (run-checker export options)))))
