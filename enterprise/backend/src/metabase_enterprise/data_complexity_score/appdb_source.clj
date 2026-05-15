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

;; SQLState codes that mean \"the table or column you referenced isn't there\" across the appdb
;; backends Metabase supports. We match on prefix (`42S`) for the MySQL family to catch both
;; `42S02` (table) and `42S22` (column) without listing each one. Postgres uses `42P01`
;; (undefined_table) and `42703` (undefined_column); H2 uses `42S02` / `42S22` for the modern JDBC
;; surface and `42102` / `42122` for the legacy one.
(def ^:private missing-relation-sql-states
  #{"42P01" "42703" "42102" "42122" "42S02" "42S22"})

(defn- missing-relation-error?
  "True when the SQL exception (or its chain) describes a missing table/column rather than some
  other database failure. Walks `getNextException` so chained Postgres/H2 errors are reachable."
  [^SQLException e]
  (loop [^SQLException cur e]
    (cond
      (nil? cur)                                        false
      (contains? missing-relation-sql-states (.getSQLState cur)) true
      :else                                             (recur (.getNextException cur)))))

(defn with-missing-relation-fallback
  "Run `f`. If [[*tolerate-missing-relations?*]] is true and `f` throws a missing-table/column
  SQL error, log a warning naming `signal` and return `fallback`. Re-throws every other failure.

  Pattern at call sites that read tables/columns introduced in a more recent Metabase version
  than the CLI may be pointed at:

    (with-missing-relation-fallback ::metabot-row nil #(t2/select-one :model/Metabot ...))"
  [signal fallback f]
  (if *tolerate-missing-relations?*
    (try
      (f)
      (catch SQLException e
        (if (missing-relation-error? e)
          (do (log/warnf "Data Complexity: %s unavailable on this appdb (%s). Falling back to %s."
                         signal (.getMessage e) (pr-str fallback))
              fallback)
          (throw e))))
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
