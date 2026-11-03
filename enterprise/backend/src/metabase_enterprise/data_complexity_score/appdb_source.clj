(ns metabase-enterprise.data-complexity-score.appdb-source
  "Schema-tolerant reads and the raw score write for the Data Complexity CLI.
  The CLI can run a newer Metabase against an older appdb, so it cannot trust the Toucan models the cron and API use."
  (:require
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

;;; ----------------------------------- read tolerance --------------------------------------

;; SQLState codes that mean "the table or column you referenced isn't there" across the appdb
;; backends Metabase supports. Listed explicitly rather than prefix-matched on `42S` so we don't
;; accidentally trip on other `42Sxx` codes a driver might introduce. Postgres uses `42P01`
;; (undefined_table) and `42703` (undefined_column); MySQL uses `42S02` / `42S22`; H2 uses
;; `42S02` / `42S22` on the modern JDBC surface and `42102` / `42122` on the legacy one.
(def ^:private missing-relation-sql-states
  #{"42102" "42122" "42703" "42P01" "42S02" "42S22"})

(defn- missing-relation-exception
  "The `SQLException` for a missing table or column that `t` is, or reaches through `getCause` and `getNextException`.
  Nil when there is none."
  ^SQLException [^Throwable t]
  ;; Toucan 2 and next.jdbc throw the raw `SQLException` today. Walking both chains also covers a wrapper that
  ;; carries it as a cause, and `seen` stops a cyclic chain.
  (loop [pending (list t)
         seen    #{}]
    (when-let [[^Throwable cur & more] (seq pending)]
      (cond
        (or (nil? cur) (contains? seen cur))
        (recur more seen)

        (and (instance? SQLException cur)
             (contains? missing-relation-sql-states (.getSQLState ^SQLException cur)))
        cur

        :else
        (recur (cond-> (conj more (.getCause cur))
                 (instance? SQLException cur) (conj (.getNextException ^SQLException cur)))
               (conj seen cur))))))

(defn with-missing-relation-fallback
  "Return `(f)`.
  When `degraded-signals` is an atom, a missing table or column error from `f` instead logs a warning, adds `signal`
  to the atom, and returns `fallback`.
  When `degraded-signals` is nil, every error propagates."
  [degraded-signals signal fallback f]
  ;; The cron and API pass nil, so a schema bug there still raises. Catch `Throwable` rather than `SQLException`
  ;; because a wrapper may carry the SQL error as its cause.
  (if-not degraded-signals
    (f)
    (try
      (f)
      (catch Throwable t
        (if (missing-relation-exception t)
          (do (log/warnf "Data Complexity: %s unavailable on this appdb (%s). Falling back to %s."
                         signal (.getMessage t) (pr-str fallback))
              (swap! degraded-signals conj signal)
              fallback)
          (throw t))))))

;;; --------------------------------------- writer ------------------------------------------

(defn verify-write-target-shape!
  "Return nil when `data_complexity_score` has the columns [[insert-score-row!]] writes.
  Throw an `ex-info` with `:cli-validation true` when the table or one of those columns is missing.
  Other errors propagate."
  []
  ;; Runs before the scoring pass, so a bad target fails at once rather than after minutes of scoring.
  ;; Extra columns from a newer schema are fine.
  (try
    (data-complexity-score.db/probe-score-columns)
    nil
    (catch Throwable t
      (if-let [e (missing-relation-exception t)]
        (throw (ex-info (str "`data_complexity_score` is missing or doesn't have the columns "
                             "--write-to-appdb needs (fingerprint, source, score_data, created_at). "
                             "Underlying SQL error: " (.getMessage e))
                        {:cli-validation true, :sql-state (.getSQLState e)}
                        t))
        (throw t)))))

(defn insert-score-row!
  "Insert one `data_complexity_score` row with `score` encoded as JSON, running no model hooks or transforms.
  Return nil."
  [fingerprint source score]
  ;; `created_at` comes from the column default, so it is in database time like the rows the cron writes.
  (data-complexity-score.db/insert-score-row! {:fingerprint fingerprint
                                               :source      source
                                               :score_data  (json/encode score)})
  nil)
