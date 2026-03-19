(ns metabase-enterprise.checker.cli
  "CLI entrypoints for the checker module.

   Invoked from metabase.core.bootstrap:
     java -jar metabase.jar --mode checker --checker cards --export /path/to/export
     java -jar metabase.jar --mode checker --checker structural --export /path/to/export"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.checker.checker :as checker]
   [metabase-enterprise.checker.format.hybrid :as hybrid]
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

(defn- run-cards-checker
  "Run the cards checker. Auto-detects format (serdes or concise/hybrid)."
  [export-dir output-file]
  (let [results (hybrid/check export-dir)
        summary (checker/summarize-results results)
        failures (filter #(not= :ok (checker/result-status (second %))) results)]
    ;; Write to output file if specified
    (when output-file
      (spit output-file (pr-str results))
      (println "Results written to:" output-file))
    ;; Print summary
    (println "Card Check Results")
    (println "==================")
    (println "Total cards:" (:total summary))
    (println "  OK:" (:ok summary))
    (println "  Errors:" (:errors summary))
    (println "  Unresolved refs:" (:unresolved summary))
    (println "  Issues:" (:issues summary))
    ;; Print failures
    (when (seq failures)
      (println "\nFailures:")
      (println "---------")
      (doseq [entry (sort-by (comp :name second) failures)]
        (println)
        (println (checker/format-result entry))))
    ;; Exit with appropriate code
    (flush)
    (System/exit (if (zero? (+ (:errors summary) (:unresolved summary) (:issues summary)))
                   0
                   1))))

(defn- run-structural-checker
  "Run the structural checker."
  [export-dir output-file]
  (let [results (structural/check export-dir)
        invalid-count (count (:invalid results))]
    (when output-file
      (spit output-file (pr-str results))
      (println "Results written to:" output-file))
    (flush)
    (System/exit (if (zero? invalid-count) 0 1))))

(def ^:private checkers
  "Available checkers."
  {"cards"      run-cards-checker
   "structural" run-structural-checker})

(def ^:private cli-spec
  "CLI options for checker mode."
  [[nil "--mode MODE" "Mode (handled by bootstrap, included here for completeness)"]
   [nil "--checker CHECKER" "Which checker to run (cards, structural)"]
   [nil "--export PATH" "Path to serdes export directory"]
   [nil "--output PATH" "Path to output file for results"]
   ["-h" "--help" "Show this help"]])

(defn- usage [summary]
  (str "Usage: java -jar metabase.jar --mode checker [options]\n\n"
       "Options:\n"
       summary
       "\n\nAvailable checkers:\n"
       "  cards       - Validate card queries using MLv2\n"
       "  structural  - Validate YAML structure against schemas"))

(defn -main
  "Main entrypoint for checker mode. Receives raw args."
  [args]
  (let [{:keys [options errors summary]} (cli/parse-opts args cli-spec)
        {:keys [checker export output help]} options]
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
          (checker-fn export output)
          (fail! (str "Unknown checker: " checker)
                 ""
                 (usage summary)))))))
