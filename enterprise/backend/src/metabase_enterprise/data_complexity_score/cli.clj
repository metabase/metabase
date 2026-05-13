(ns metabase-enterprise.data-complexity-score.cli
  "CLI entrypoint for computing the data complexity score.

  Two source modes:

    `--source representation` (default) — scores an on-disk serdes export. No appdb required
       unless `--write-to-appdb true` is also requested. Useful for offline scoring of
       benchmarks, CI, and exploratory analysis.

    `--source appdb` — bootstraps the application database and scores live entities the same
       way the cron job (`task.complexity-score`) and API endpoint do.

  Persistence is controlled independently by `--write-to-appdb`. The default tracks the source:
  true in appdb mode, false in representation mode. Both can be overridden explicitly.

  Invoke via:

    clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli --source appdb
    clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli \\
      --source representation -r path/to/fixture/

  Patterned after [[metabase-enterprise.checker.cli]] — same `fail!` pattern, same arg style."
  (:require
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.models.data-complexity-score :as data-complexity-score]
   [metabase-enterprise.data-complexity-score.representation :as representation]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]))

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
      (not (.exists f))       (throw (ex-info (str "--representation-dir does not exist: " path)
                                              {:cli-validation true :path path}))
      (not (.isDirectory f))  (throw (ex-info (str "--representation-dir must be a directory: " path)
                                              {:cli-validation true :path path})))))

(def ^:private unset
  "Sentinel for `--write-to-appdb` so we can tell 'user didn't pass it' apart from an explicit false."
  ::unset)

(def ^:private cli-options
  [["-s" "--source SOURCE"           "'representation' (default) or 'appdb'."
    :default "representation"
    :validate [#{"representation" "appdb"} "--source must be 'representation' or 'appdb'."]]
   ["-r" "--representation-dir PATH" "Directory of a serdes YAML export. Required when --source is 'representation'."]
   ["-e" "--embeddings PATH"         "Explicit embeddings JSON file. Overrides embeddings.json in the directory."]
   ["-w" "--write-to-appdb BOOL"     "Persist the score row. Defaults: true when --source is 'appdb', false otherwise."
    :default unset
    :parse-fn #(case % "true" true "false" false ::invalid)
    :validate [#(not= % ::invalid) "--write-to-appdb must be 'true' or 'false'."]]
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
    (do
      #_{:clj-kondo/ignore [:discouraged-var]}
      (print (pretty result))
      (flush))))

(defn- bootstrap-appdb!
  "Bring up the application database (migrations + connection pool) so that `t2/select` against
  Toucan models and settings/feature-flag lookups succeed. We resolve at call time so a pure
  representation-mode run without `--write-to-appdb` doesn't pay the setup cost. Driver plugin
  loading is intentionally skipped: the scorer only queries appdb metadata (Card, Table, Field,
  Measure rows), never user databases, so the driver/plugin layer isn't on this path."
  []
  ((requiring-resolve 'metabase.app-db.core/setup-db!) :create-sample-content? false))

(defn- resolve-write?
  "Apply the source-driven default for `--write-to-appdb` when it wasn't passed explicitly."
  [{:keys [write-to-appdb]} appdb-source?]
  (if (= write-to-appdb unset) appdb-source? write-to-appdb))

(defn- validate-options!
  "Throws `ex-info` with `:cli-validation true` on user-facing misconfigurations."
  [{:keys [source representation-dir embeddings]}]
  (case source
    "appdb"
    (when (or representation-dir embeddings)
      (throw (ex-info "--source appdb does not accept --representation-dir or --embeddings"
                      {:cli-validation true})))

    "representation"
    (do
      (when-not representation-dir
        (throw (ex-info "Missing --representation-dir option (required for --source representation)"
                        {:cli-validation true})))
      (validate-dir! representation-dir))))

(defn- run-appdb-mode!
  "Score against the live appdb the same way the cron does; optionally persist."
  [write?]
  (bootstrap-appdb!)
  (let [result (complexity/complexity-scores
                (assoc (synonym-source/complexity-scores-opts)
                       :metabot-scope (metabot-scope/internal-metabot-scope)))]
    (when write?
      (let [fp (task.complexity-score/current-fingerprint)]
        (data-complexity-score/record-score! fp "appdb" result)
        (task.complexity-score/maybe-advance-last-fingerprint! fp result)))
    result))

(defn- run-representation-mode!
  "Score against an on-disk serdes export; optionally persist with a representation-tagged
  `source` so the row is distinguishable from cron/API/CLI-from-appdb rows. The persisted
  fingerprint still uses [[task.complexity-score/current-fingerprint]] so it lines up with the
  cron's bookkeeping; the new `source` column does the discrimination. We never advance
  `data-complexity-scoring-last-fingerprint` here — a representation-derived score isn't
  authoritative for this instance and mustn't mute the cron."
  [{:keys [representation-dir embeddings]} write?]
  (when write?
    (bootstrap-appdb!))
  (let [{:keys [library universe embedder digest]} (representation/load-dir representation-dir
                                                                            :embeddings-path embeddings)
        result                                     (complexity/score-from-entities library universe embedder {})]
    (when write?
      (data-complexity-score/record-score! (task.complexity-score/current-fingerprint)
                                           (str "representation:" digest)
                                           result))
    result))

(defn- with-defaults
  "Apply parse-opts-style defaults so library callers (tests, REPL) don't have to thread them."
  [options]
  (cond-> options
    (nil? (:source options))         (assoc :source "representation")
    (nil? (:write-to-appdb options)) (assoc :write-to-appdb unset)))

(defn- run-cli
  "Pure core of the CLI: validates options and dispatches to the source-specific runner.
  Returns the result map so tests can call this directly without intercepting `System/exit`.
  Throws `ex-info` for validation failures (with `:cli-validation true` in the ex-data) and
  propagates `representation/load-dir`'s `ex-info` (e.g. missing `--embeddings` override).
  `-main` converts those into user-facing `fail!`; library callers can inspect the ex-data
  and render errors their own way."
  [options]
  (let [options (with-defaults options)]
    (validate-options! options)
    (let [appdb-source? (= (:source options) "appdb")
          write?        (resolve-write? options appdb-source?)]
      (if appdb-source?
        (run-appdb-mode! write?)
        (run-representation-mode! options write?)))))

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
                          ;; Handle CLI validation failures (`:cli-validation`) and missing-embeddings
                          ;; failures from representation (`:embeddings-path`) — both are user-facing
                          ;; misconfigurations rather than bugs.
                          (let [data (ex-data e)]
                            (if (or (:cli-validation data) (:embeddings-path data))
                              (fail! (ex-message e))
                              (throw e)))))))
  (System/exit 0))
