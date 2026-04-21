(ns metabase-enterprise.data-complexity-score.cli
  "CLI entrypoint for computing the data complexity score against a representation
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
   [metabase-enterprise.data-complexity-score.representation :as representation]))

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
      (not (.exists f))       (fail! (str "--representation-dir does not exist: " path))
      (not (.isDirectory f))  (fail! (str "--representation-dir must be a directory: " path)))))

(def ^:private cli-options
  [["-r" "--representation-dir PATH" "Directory of representation JSON files (required)."]
   ["-e" "--embeddings PATH"         "Explicit embeddings JSON file. Overrides embeddings.json in the directory."]
   ["-o" "--output PATH"             "Write EDN result to this file instead of stdout."]
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
  result map so tests can call this directly without intercepting `System/exit`. Propagates
  `load-dir`'s `ex-info` (e.g. missing `--embeddings` override) so the caller can decide how to
  render it — `-main` converts the resolved-path variant into a user-facing `fail!`."
  [{:keys [representation-dir embeddings]}]
  (when-not representation-dir
    (fail! "Missing --representation-dir option"))
  (validate-dir! representation-dir)
  (let [{:keys [library universe embedder]} (representation/load-dir representation-dir :embeddings-path embeddings)]
    (complexity/score-from-entities library universe embedder {})))

;; `-main` is invoked via `clj -M:ee:dev -m …cli`, not via an AOT'd jar, so `(:gen-class)` is unnecessary.
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
                          (if (:resolved-path (ex-data e))
                            (fail! (ex-message e))
                            (throw e))))))
  (System/exit 0))
