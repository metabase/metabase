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

  Two invocation styles:

    Dev (classpath, no AOT):
      clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli --source appdb
      clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli \\
        --source representation -r path/to/fixture/

    AOT JAR (via `metabase.core.bootstrap`):
      java -jar metabase.jar --mode complexity-score --source appdb
      java -jar metabase.jar --mode complexity-score \\
        --source representation -r path/to/fixture/

  Same `fail!` pattern and arg style as the other standalone-mode CLIs,
  and the same bootstrap-dispatched [[entrypoint]] hook."
  (:require
   [clojure.java.io :as io]
   [clojure.tools.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.models.data-complexity-score :as data-complexity-score]
   [metabase-enterprise.data-complexity-score.representation :as representation]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   ;; Loaded for side-effect: derives setting :on-change event topics from :metabase/event.
   ;; metabase.core.core/entrypoint normally does this, but the standalone CLI bypasses it.
   [metabase.driver.init]
   [metabase.util.json :as json]))

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

(defn- fail-with-trace!
  "Print `t`'s stack trace (including `caused by` chain) to stderr, then fail! with a one-line summary.
  Used for unexpected throwables — keeps the SQL exception / column-mismatch site visible instead of
  collapsing it into just `<class>: <message>`."
  [^Throwable t]
  (.printStackTrace t)
  (fail! (format "%s: %s" (.getName (class t)) (.getMessage t))))

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
   ["-o" "--output PATH"             "Write pretty JSON to a file instead of single-line JSON on stdout."]
   ["-E" "--embedder NAME"           "Override the synonym embedder. 'in-process' runs all-MiniLM-L6-v2 in the JVM (needs the embedder plugin or the :embedder dev alias)."
    :validate [#{"in-process"} "--embedder currently only supports 'in-process'."]]
   ;; Consumed by `metabase.core.bootstrap` when invoked as `java -jar metabase.jar --mode …`. Declared
   ;; here so tools.cli accepts it and `parse-opts` doesn't report it as an unknown flag.
   [nil  "--mode MODE"               "(JAR invocation only; handled by bootstrap before reaching this CLI.)"]
   ["-h" "--help"                    "Show this message."]])

(defn- usage [summary]
  (str "Usage:\n"
       "  clojure -M:ee:dev -m metabase-enterprise.data-complexity-score.cli [options]\n"
       "  java -jar metabase.jar --mode complexity-score [options]\n\n"
       "Options:\n" summary))

(defn- write-result! [result output-path]
  (if output-path
    (spit output-path (json/encode result {:pretty true}))
    (do
      (output! (json/encode result))
      (flush))))

(defn- resolve-write?
  "Apply the source-driven default for `--write-to-appdb` when it wasn't passed explicitly."
  [{:keys [write-to-appdb]} appdb-source?]
  (if (= write-to-appdb unset) appdb-source? write-to-appdb))

(defn- validate-options!
  "Throws `ex-info` with `:cli-validation true` on user-facing misconfigurations."
  [{:keys [source representation-dir embeddings embedder]}]
  (when (and embeddings embedder)
    (throw (ex-info (str "--embeddings and --embedder are mutually exclusive: an embedder override would "
                         "silently ignore the explicit embeddings file.")
                    {:cli-validation true})))
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

(def ^:private in-process-descriptor
  "Model identity for `--embedder in-process`.
  Mirrors `metabase-enterprise.embedder.core/default-model-descriptor`; kept as a literal so parsing the flag
  doesn't need the plugin on the classpath — the provider dispatch resolves it (and errors usefully) only
  when embeddings are actually requested."
  {:provider         "in-process"
   :model-name       "all-MiniLM-L6-v2"
   :model-dimensions 384})

(defn- assert-descriptor-in-sync!
  "When the embedder module is loadable, fail loudly if [[in-process-descriptor]] drifted from its source
  of truth. The module test suite also asserts this, but only runs under the :embedder alias; this check
  runs wherever the flag is actually usable."
  []
  (when-let [actual (try
                      (classloader/require 'metabase-enterprise.embedder.core)
                      (some-> (ns-resolve 'metabase-enterprise.embedder.core 'default-model-descriptor) deref)
                      (catch Exception _ nil))]
    (when (not= actual in-process-descriptor)
      (throw (ex-info (str "in-process-descriptor is out of sync with "
                           "metabase-enterprise.embedder.core/default-model-descriptor; update the literal.")
                      {:literal in-process-descriptor :actual actual})))))

(defn- embedder-override
  "Resolve the `--embedder` flag into `{:embedder :embedding-model-meta}` to splice over the
  default synonym embedder. `nil` when the flag wasn't passed.

  `in-process` goes through [[embedders/provider-embedder]] and thus the registered `in-process` provider
  — exactly the production code path, including the guidance error when the embedder plugin jar is absent.
  The descriptor passed to the provider also carries `:vector-dimensions` so the provider's dimension
  guard protects CLI runs; the recorded `:embedding-model-meta` keeps the facade's `:model-dimensions`
  shape."
  [embedder-name]
  (case embedder-name
    "in-process" (do
                   (assert-descriptor-in-sync!)
                   {:embedder             (embedders/provider-embedder
                                           (assoc in-process-descriptor
                                                  :vector-dimensions (:model-dimensions in-process-descriptor)))
                    :embedding-model-meta in-process-descriptor})
    nil))

(defn- override-fingerprint-fragment
  "Synonym-axis fingerprint fragment describing an active `--embedder` override, nil without one.
  Replaces the configured fragment in the persisted fingerprint so override rows describe what actually
  ran and can't shadow scores produced with the configured embedder."
  [override]
  (when override
    {:synonym-source  :cli-embedder-override
     :embedding-model (:embedding-model-meta override)
     :text-variant    embedders/default-text-variant}))

(defn- run-appdb-mode!
  "Score against the live appdb; optionally persist the row.
  Snowplow is off here, so we don't advance `data-complexity-scoring-last-fingerprint` — leave that to the cron."
  [write? override]
  (mdb/setup-db-without-migrations!)
  (let [result (complexity/complexity-scores
                (-> (synonym-source/complexity-scores-opts)
                    (merge override)
                    (assoc :metabot-scope (metabot-scope/internal-metabot-scope)
                           :emit-snowplow? false)))]
    (when write?
      (data-complexity-score/record-score! (task.complexity-score/current-fingerprint
                                            (override-fingerprint-fragment override))
                                           "appdb" result))
    result))

(defn- run-representation-mode!
  "Score against an on-disk serdes export; optionally persist with `source` = `representation:<digest>`."
  [{:keys [representation-dir embeddings]} write? override]
  (when write?
    (mdb/setup-db-without-migrations!))
  (let [{:keys [library universe embedder digest]} (representation/load-dir representation-dir
                                                                            :embeddings-path embeddings)
        embedder                                   (or (:embedder override) embedder)
        result                                     (complexity/score-from-entities
                                                    library universe embedder
                                                    (select-keys override [:embedding-model-meta]))]
    (when write?
      (data-complexity-score/record-score! (task.complexity-score/current-fingerprint
                                            (override-fingerprint-fragment override))
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
  Throws `ex-info` for validation failures (`:cli-validation true`) and propagates `representation/load-dir`'s
  `ex-info` (e.g. missing `--embeddings` override).
  [[entrypoint]] converts those to `fail!`; library callers can inspect the ex-data themselves."
  [options]
  (let [options (with-defaults options)]
    (validate-options! options)
    (let [appdb-source? (= (:source options) "appdb")
          write?        (resolve-write? options appdb-source?)
          override      (embedder-override (:embedder options))]
      (if appdb-source?
        (run-appdb-mode! write? override)
        (run-representation-mode! options write? override)))))

(defn entrypoint
  "Main entrypoint. Receives raw args (a seq) and owns the process — it always calls `System/exit`.
  Called from [[metabase.core.bootstrap/run-standalone-mode]] via `--mode complexity-score`
  in the AOT JAR, and delegated to from [[-main]] for the `clj -M:ee:dev -m …` dev path."
  [args]
  (let [{:keys [options errors summary]} (cli/parse-opts args cli-options)]
    (cond
      (:help options) (do (output! (usage summary)) (System/exit 0))
      (seq errors)    (apply fail! errors)
      :else           (try
                        (write-result! (run-cli options) (:output options))
                        (catch clojure.lang.ExceptionInfo e
                          ;; Handle CLI validation failures (`:cli-validation`) and missing-embeddings
                          ;; failures from representation (`:embeddings-path`) — both are user-facing
                          ;; misconfigurations rather than bugs. Everything else gets the stack trace
                          ;; so an `ex-cause` SQL exception remains diagnosable from the terminal.
                          (let [data (ex-data e)]
                            (if (or (:cli-validation data) (:embeddings-path data))
                              (fail! (ex-message e))
                              (fail-with-trace! e))))
                        (catch Throwable t
                          ;; Most likely an older appdb missing a column/table the scorer reads —
                          ;; print the trace so the failing query/site is visible.
                          (fail-with-trace! t))))
    (System/exit 0)))

;; No `(:gen-class)` — the AOT JAR routes through [[metabase.core.bootstrap]] and dispatches to
;; [[entrypoint]] via `requiring-resolve`, so a class-file `-main` would be dead weight. `-main`
;; only exists for the `clj -M:ee:dev -m …cli` dev path.
#_{:clj-kondo/ignore [:main-without-gen-class]}
(defn -main
  "Dev entrypoint. Delegates to [[entrypoint]], which owns the process and calls `System/exit`."
  [& args]
  (entrypoint args))
