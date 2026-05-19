(ns metabase-enterprise.data-complexity-score.appdb-source
  "CLI-specific appdb adapter: schema-tolerant reads and raw-JDBC writes for the Data Complexity
  CLI. Lets one modern jar score the entire cloud fleet's appdbs, including ones running an older
  Metabase version whose schema lacks tables/columns the modern code references.

  Why a parallel path? The cron and API run against an appdb at the same Metabase version, so they
  can trust Toucan models end-to-end. The CLI cannot: a v73 binary sampling a v54 appdb may find
  tables (e.g. `metabot`, `measure`) and columns (e.g. `metabase_table.is_published`) that don't
  exist yet, and a `:before-insert` hook on a newer model definition mustn't surprise us either.

  Read tolerance — see [[*tolerate-missing-relations?*]] and [[with-missing-relation-fallback]].
  When the var is true, a Toucan read that fails because its target table or one of its referenced
  columns doesn't exist falls back to the caller-supplied empty/default value. Off by default so
  the cron and API still surface schema bugs as exceptions; the CLI binds it true for the duration
  of its scoring pass.

  Write contract — at most one `INSERT INTO data_complexity_score` per CLI run. No transforms run
  against the row (`:score_data` is JSON-encoded here, never via `mi/transform-json`), no
  fingerprint setting is touched, no Snowplow event is published."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (java.sql SQLException Timestamp)))

(set! *warn-on-reflection* true)

;;; ----------------------------------- read tolerance --------------------------------------

(def ^:dynamic *tolerate-missing-relations?*
  "When true, [[with-missing-relation-fallback]] returns the caller's fallback instead of throwing
  on `table-doesn't-exist` / `column-doesn't-exist` SQL errors. The CLI binds this true around its
  scoring pass; everything else (cron, API, tests) leaves it false so genuine schema bugs still
  surface as exceptions."
  false)

(def ^:dynamic *degraded-signals*
  "Optional atom (or nil) that [[with-missing-relation-fallback]] `swap!`s a `signal` keyword into
  whenever it returns the fallback. The CLI binds it so the final score can be stamped with the
  set of degraded signals — letting operators tell a real `0` from `\"schema too old to score
  this signal\"`. Default nil because cron / API don't need it (their schema is current)."
  nil)

;; SQLState codes that mean "the table or column you referenced isn't there" across the appdb
;; backends Metabase supports. Listed explicitly rather than prefix-matched on `42S` so we don't
;; accidentally trip on other `42Sxx` codes a driver might introduce. Postgres uses `42P01`
;; (undefined_table) and `42703` (undefined_column); MySQL uses `42S02` / `42S22`; H2 uses
;; `42S02` / `42S22` on the modern JDBC surface and `42102` / `42122` on the legacy one.
(def ^:private missing-relation-sql-states
  #{"42P01" "42703" "42102" "42122" "42S02" "42S22"})

(defn- missing-relation-error?
  "True when `t` (or anything reachable via `getNextException` / `getCause`) is a `SQLException`
  with a SQLState in [[missing-relation-sql-states]]. We walk both chains: Toucan 2 + next.jdbc
  hand us a raw `SQLException` today so `getNextException` is enough, but a defensive `getCause`
  walk costs nothing and protects against future wrappers (e.g. an `ex-info` carrying the SQL
  exception as `:cause`). Cycle-guarded so a self-referential chain can't loop forever."
  [^Throwable t]
  (loop [pending (list t)
         seen    #{}]
    (if (empty? pending)
      false
      (let [^Throwable cur (first pending)
            rest-pending   (rest pending)]
        (cond
          (or (nil? cur) (contains? seen cur))
          (recur rest-pending seen)

          (and (instance? SQLException cur)
               (contains? missing-relation-sql-states (.getSQLState ^SQLException cur)))
          true

          :else
          (recur (cond-> rest-pending
                   (instance? SQLException cur) (conj (.getNextException ^SQLException cur))
                   true                         (conj (.getCause cur)))
                 (conj seen cur)))))))

(defn with-missing-relation-fallback
  "Run `f`. If [[*tolerate-missing-relations?*]] is true and `f` throws anything reachable
  through `getNextException` / `getCause` to a SQL `missing-table` / `missing-column` error,
  log a warning naming `signal` and return `fallback`. Every other throwable propagates.

  We catch `Throwable` (not just `SQLException`) on purpose — Toucan 2 / next.jdbc hand us a raw
  `SQLException` today, but a future wrapper layer that surfaces the SQL error as the `:cause` of
  an `ex-info` would otherwise slip past us. `missing-relation-error?` does the cause-walk.

  Pattern at call sites that read tables/columns introduced in a more recent Metabase version
  than the CLI may be pointed at:

    (with-missing-relation-fallback ::metabot-row nil #(t2/select-one :model/Metabot ...))"
  [signal fallback f]
  (if *tolerate-missing-relations?*
    (try
      (f)
      (catch Throwable t
        (if (missing-relation-error? t)
          (do (log/warnf "Data Complexity: %s unavailable on this appdb (%s). Falling back to %s."
                         signal (.getMessage t) (pr-str fallback))
              (some-> *degraded-signals* (swap! conj signal))
              fallback)
          (throw t))))
    (f)))

;;; --------------------------------------- writer ------------------------------------------

(defn verify-write-target-shape!
  "Throws an `ex-info` (with `:cli-validation true`) when the appdb doesn't have
  `data_complexity_score` with the four columns [[record-score!]] writes. Extra columns are fine
  — we only check that the names we INSERT all resolve, by running `SELECT … WHERE 1=0` so the
  database parses the projection without scanning rows.

  Call this before kicking off a slow scoring pass when `--write-to-appdb` is on, so the run
  fails fast and obviously instead of computing for minutes and then crashing on INSERT."
  []
  (try
    (jdbc/execute-one! (mdb/data-source)
                       ["SELECT fingerprint, source, score_data, created_at
                         FROM data_complexity_score
                         WHERE 1 = 0"])
    nil
    (catch SQLException e
      (if (missing-relation-error? e)
        (throw (ex-info (str "`data_complexity_score` is missing or doesn't have the columns "
                             "--write-to-appdb needs (fingerprint, source, score_data, created_at). "
                             "Underlying SQL error: " (.getMessage e))
                        {:cli-validation true
                         :sql-state      (.getSQLState e)}))
        (throw e)))))

(defn record-score!
  "Insert one row into `data_complexity_score` via raw JDBC. No Toucan transforms, no model
  hooks. `score-data` is serialized to JSON here so we don't depend on `mi/transform-json`.

  Returns nil. Callers that need the row (e.g. tests) look it up by `fingerprint`."
  [fingerprint source score-data]
  (let [ds  (mdb/data-source)
        row {:fingerprint fingerprint
             :source      source
             :score_data  (json/encode score-data)
             :created_at  (Timestamp. (System/currentTimeMillis))}]
    (jdbc/execute-one! ds (mdb/compile {:insert-into [:data_complexity_score]
                                        :values      [row]}))
    nil))
