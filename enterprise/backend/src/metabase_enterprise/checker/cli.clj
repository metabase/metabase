(ns metabase-enterprise.checker.cli
  "CLI entrypoints for the checker module.

   Invoked from metabase.core.bootstrap:
     java -jar metabase.jar --mode checker --checker semantic --export /path/to/export --schema-dir /path/to/schemas
     java -jar metabase.jar --mode checker --checker structural --export /path/to/export"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.checker.semantic :as checker]
   [metabase-enterprise.checker.structural :as structural]))

(set! *warn-on-reflection* true)

(defn- fail!
  "Print error message to stderr and exit with code 1."
  [& messages]
  (binding [*out* *err*]
    (doseq [msg messages]
      (println msg)))
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

(defn- run-semantic-checker
  "Run the semantic checker — validates that references resolve and queries make sense."
  [export-dir {:keys [output errors-only schema-dir]}]
  (when-not schema-dir
    (fail! "Missing --schema-dir option (required for semantic checker)"))
  (validate-directory! schema-dir)
  (let [{:keys [results]} (try
                            (checker/check export-dir schema-dir)
                            (catch clojure.lang.ExceptionInfo e
                              (fail! (.getMessage e))))
        summary  (checker/summarize-results results)
        failures (filter #(not= :ok (checker/result-status (second %))) results)]
    (if errors-only
      ;; Errors-only mode: just errors to stdout, nothing else
      (doseq [entry (sort-by (comp :name second) failures)
              :let [error-str (checker/format-error entry)]
              :when error-str]
        (println error-str))
      ;; Normal mode: full output
      (do
        ;; Write to output file if specified
        (when output
          (spit output (pr-str results))
          (println "Results written to:" output))
        ;; Print summary
        (println "Semantic Check Results")
        (println "=====================")
        (println "Total entities:" (:total summary))
        (println "  OK:" (:ok summary))
        (println "  Errors:" (:errors summary))
        (println "  Unresolved refs:" (:unresolved summary))
        (println "  Native SQL errors:" (:native-errors summary))
        (println "  Issues:" (:issues summary))
        ;; Print failures
        (when (seq failures)
          (println "\nFailures:")
          (println "---------")
          (doseq [entry (sort-by (comp :name second) failures)]
            (println)
            (println (checker/format-result entry))))))
    ;; Exit with appropriate code
    (flush)
    (System/exit (if (zero? (+ (:errors summary) (:unresolved summary) (:native-errors summary) (:issues summary)))
                   0
                   1))))

(defn- format-structural-error
  "Format a structural validation error concisely for LLM consumption."
  [{:keys [file type error diagnostics raw-errors]}]
  (let [lines (atom [(str "file: " file " (" (name type) ")")])]
    (if error
      (swap! lines conj (str "  " error))
      (if (seq diagnostics)
        (doseq [{:keys [message]} diagnostics]
          (swap! lines conj (str "  " message)))
        (swap! lines conj (str "  " (pr-str raw-errors)))))
    (str/join "\n" @lines)))

(defn- run-structural-checker
  "Run the structural checker."
  [export-dir {:keys [output errors-only]}]
  (let [results (structural/check export-dir)
        invalid-count (count (:invalid results))]
    (if errors-only
      ;; Errors-only mode: just errors to stdout
      (doseq [inv (:invalid results)]
        (println (format-structural-error inv)))
      ;; Normal mode
      (when output
        (spit output (pr-str results))
        (println "Results written to:" output)))
    (flush)
    (System/exit (if (zero? invalid-count) 0 1))))

(def ^:private checkers
  "Available checkers."
  {"semantic"   run-semantic-checker
   "structural" run-structural-checker})

(def ^:private cli-spec
  "CLI options for checker mode."
  [[nil "--mode MODE" "Mode (handled by bootstrap, included here for completeness)"]
   [nil "--checker CHECKER" "Which checker to run (semantic, structural)"]
   [nil "--export PATH" "Path to serdes export directory"]
   [nil "--schema-dir PATH" "Path to database schema directory (required for semantic checker)"]
   [nil "--output PATH" "Path to output file for results"]
   [nil "--errors-only" "Output only errors to stdout (concise format for LLM consumption)"]
   ["-h" "--help" "Show this help"]])

(defn- usage [summary]
  (str "Usage: java -jar metabase.jar --mode checker [options]\n\n"
       "Options:\n"
       summary
       "\n\nAvailable checkers:\n"
       "  semantic    - Validate references resolve and queries are correct\n"
       "  structural  - Validate YAML structure against schemas"))

(defn -main
  "Main entrypoint for checker mode. Receives raw args."
  [args]
  (let [{:keys [options errors summary]} (cli/parse-opts args cli-spec)
        {:keys [checker export help]} options]
    (cond
      help
      (do (println (usage summary))
          (System/exit 0))

      errors
      (fail! (str "Error parsing arguments:\n" (str/join "\n" errors))
             ""
             (usage summary))

      (not checker)
      (fail! "Missing --checker option"
             ""
             (usage summary))

      (not export)
      (fail! "Missing --export option"
             ""
             (usage summary))

      :else
      (do
        (validate-directory! export)
        (if-let [checker-fn (get checkers checker)]
          (checker-fn export options)
          (fail! (str "Unknown checker: " checker)
                 ""
                 (usage summary)))))))
