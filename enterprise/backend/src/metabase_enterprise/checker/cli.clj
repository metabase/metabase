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

(defn- validate-schema-path!
  "Validate that --schema-dir matches the expected shape for `fmt`:
     :serdes  → must be a directory (containing database subdirectories)
     :concise → must be a regular file (the JSON metadata file)"
  [path fmt]
  (let [f (io/file path)]
    (cond
      (not (.exists f))
      (fail! (str "--schema-dir does not exist: " path))

      (and (= fmt :serdes) (not (.isDirectory f)))
      (fail! (str "--schema-format serdes expects a directory of database folders, got a file: " path)
             "Did you mean --schema-format concise?")

      (and (= fmt :concise) (not (.isFile f)))
      (fail! (str "--schema-format concise expects a single JSON file, got a directory: " path)
             "Did you mean --schema-format serdes?"))))

(defn- print-human
  "Print one FAIL block per failing entity, then a one-line summary."
  [results]
  (let [failures (->> results
                      (filter #(not= :ok (checker/result-status (second %))))
                      (sort-by (comp :name second)))]
    (doseq [entry failures
            :let [block (checker/format-fail entry)]
            :when block]
      (output! block)
      (output!))
    (output! (format "Ran %d entities, %d failed" (count results) (count failures)))))

(defn- run-checker
  "Run the semantic checker."
  [export-dir {:keys [output schema-dir schema-format]}]
  (when-not schema-dir
    (fail! "Missing --schema-dir option"))
  (let [schema-fmt (case schema-format
                     "concise" :concise
                     "serdes"  :serdes
                     nil       :serdes
                     (fail! (str "Unknown --schema-format: " schema-format
                                 " (must be 'serdes' or 'concise')")))
        _          (validate-schema-path! schema-dir schema-fmt)
        {:keys [results]} (try
                            (checker/check export-dir schema-dir nil {:schema-format schema-fmt})
                            (catch clojure.lang.ExceptionInfo e
                              (fail! (.getMessage e))))
        summary    (checker/summarize-results results)]
    (when output
      (spit output (pr-str results)))
    (print-human results)
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
   [nil "--output PATH" "Path to output file for raw EDN results"]
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
