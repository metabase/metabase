(ns metabase-enterprise.data-complexity-score.cli
  "CLI entrypoint for computing the data-complexity-score against a representation
  directory (see [[metabase-enterprise.data-complexity-score.representation]]). Intended for offline
  scoring in benchmarks, CI, or exploratory analysis where a live Metabase instance isn't
  available.

  Invoke via:

    clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli \\
      --representation-dir path/to/fixture/

  Patterned after [[metabase-enterprise.checker.cli]] — same `fail!` pattern, same arg style."
  (:require
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.representation :as representation]
   [metabase-enterprise.data-complexity-score.settings :as settings]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:discouraged-var]}
(def ^:private output!
  "Alias for println so the lint suppression stays in one place."
  println)

(defn- fail!
  "Print an error to stderr and exit 1."
  [& messages]
  (binding [*out* *err*]
    (doseq [msg messages] (output! msg)))
  (flush)
  (System/exit 1))

(defn- validate-dir! [path]
  (let [f (io/file path)]
    (cond
      (not (.exists f))      (throw (ex-info (str "--representation-dir does not exist: " path)
                                             {:cli-validation true :path path}))
      (not (.isDirectory f)) (throw (ex-info (str "--representation-dir must be a directory: " path)
                                             {:cli-validation true :path path})))))

(def ^:private cli-options
  [["-r" "--representation-dir PATH" "Directory of representation JSON files (required)."]
   ["-e" "--embeddings PATH"         "Explicit embeddings JSON file. Overrides embeddings.json in the directory."]
   ["-o" "--output PATH"             "Write EDN result to this file instead of stdout."]
   ["-l" "--level N"
    (str "Complexity-score detail level (0–" settings/max-level "). Defaults to the "
         "MB_SEMANTIC_COMPLEXITY_LEVEL env var / `semantic-complexity-level` setting.")
    :parse-fn #(Integer/parseInt %)
    :validate [#(<= 0 % settings/max-level)
               (str "--level must be between 0 and " settings/max-level " inclusive.")]]
   ["-h" "--help"                    "Show this message."]])

(defn- usage [summary]
  (str "Usage: clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli [options]\n\n"
       "Options:\n" summary))

(defn- pretty [result]
  (with-out-str
    #_{:clj-kondo/ignore [:discouraged-var]}
    (pprint/pprint result)))

(defn- write-result! [result output-path]
  (if output-path
    (spit output-path (pretty result))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (print (pretty result))))

(defn- run-cli
  "Pure core of the CLI: validates options, loads representation, computes the score. Returns the
  result map so tests can call this directly without intercepting `System/exit`. Throws `ex-info`
  for validation failures (with `:cli-validation true` in the ex-data) and propagates `load-dir`'s
  `ex-info` (e.g. missing `--embeddings` override). `-main` converts those into user-facing
  `fail!`; library callers can inspect the ex-data and render errors their own way."
  [{:keys [representation-dir embeddings level]}]
  (when-not representation-dir
    (throw (ex-info "Missing --representation-dir option" {:cli-validation true})))
  (validate-dir! representation-dir)
  (let [{:keys [library universe embedder]} (representation/load-dir representation-dir :embeddings-path embeddings)]
    (complexity/score-from-entities library universe embedder
                                    (cond-> {} level (assoc :level level)))))

;; `-main` is invoked via `clj -M:ee:dev -m …cli`, not via an AOT'd jar, so `(:gen-class)` is
;; unnecessary.
#_{:clj-kondo/ignore [:main-without-gen-class]}
(defn -main
  "Entrypoint."
  [& args]
  (let [{:keys [options errors summary]} (cli/parse-opts args cli-options)]
    (cond
      (:help options) (do (output! (usage summary)) (System/exit 0))
      (seq errors)    (apply fail! errors)
      :else           (try
                        (write-result! (run-cli options) (:output options))
                        (catch clojure.lang.ExceptionInfo e
                          (let [data (ex-data e)]
                            (if (or (:cli-validation data) (:resolved-path data))
                              (fail! (ex-message e))
                              (throw e)))))))
  (System/exit 0))
