(ns metabase-enterprise.security-center.matching
  "Advisory matching engine. Evaluates HoneySQL queries against the appdb
   and combines with version checks to determine match status."
  (:require
   [metabase-enterprise.security-center.schema :as schema]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [next.jdbc.result-set :as rs]
   [toucan2.core :as t2])
  (:import
   (org.semver4j Semver)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Version Parsing ------------------------------------------------

(def ^:private QueryResult
  "Result of executing a matching query: true (matched), false (no match), or :error."
  [:or :boolean [:= :error]])

(mu/defn parse-version :- [:maybe [:fn #(instance? Semver %)]]
  "Parse a version string into a Semver instance. Returns nil on failure.
   Handles Metabase version strings like \"v0.55.3\", \"0.55.17.5\", \"v1.2.3-RC1\"."
  [version-string :- [:maybe :string]]
  (when version-string
    (try
      (Semver/coerce version-string)
      (catch Exception _
        nil))))

(defn- version-in-range?
  "True if `version` is >= min and < fixed. A nil `version` (e.g. vLOCAL_DEV or
   vUNKNOWN, which don't parse) is treated as not in any range."
  [version {:keys [min fixed]}]
  (when version
    (let [^Semver min-v   (parse-version min)
          ^Semver fixed-v (parse-version fixed)]
      (and min-v fixed-v
           (.isGreaterThanOrEqualTo ^Semver version min-v)
           (.isLowerThan ^Semver version fixed-v)))))

(defn- affected-by-version?
  "True if `version` falls in any of the affected version ranges."
  [version ranges]
  (boolean (some #(version-in-range? version %) ranges)))

;;; ---------------------------------------------- Query Execution ------------------------------------------------

(defn- select-query-for-dialect
  "Pick the matching query for the current appdb dialect, falling back to :default."
  [matching-query]
  (or (get matching-query (mdb/db-type))
      (get matching-query :default)))

(def ^:private ^:dynamic *query-timeout-seconds*
  "Maximum execution time in seconds for advisory matching queries."
  120)

(defn- query-read-only!
  "Execute a HoneySQL query on a fresh connection with defense-in-depth:
   1. setReadOnly(true) — driver-level write rejection
   2. Explicit transaction with unconditional rollback — guarantees no writes persist
      even if the driver doesn't enforce read-only
   3. setQueryTimeout — kills the query if it exceeds [[*query-timeout-seconds*]]"
  [hsql-query]
  (let [[sql & params] (mdb/compile hsql-query)
        driver         (mdb/db-type)]
    (with-open [^java.sql.Connection conn (.getConnection (mdb/data-source))]
      (.setReadOnly conn true)
      (.setAutoCommit conn false)
      (try
        (with-open [stmt (doto (sql-jdbc.execute/prepared-statement driver conn sql params)
                           (.setQueryTimeout *query-timeout-seconds*))
                    rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
          (rs/datafiable-result-set rs conn {}))
        (finally
          (.rollback conn))))))

(mu/defn execute-matching-query! :- QueryResult
  "Execute a matching query against the appdb.
   Returns true if rows matched, false if no rows, :error if query failed.
   nil matching_query means 'affects all instances' — returns true."
  [matching-query :- [:maybe :map]]
  (if (nil? matching-query)
    true
    (if-let [query (select-query-for-dialect matching-query)]
      (try
        (boolean (seq (query-read-only! query)))
        (catch Throwable e
          (log/warnf e "Matching query failed: %s" (pr-str query))
          :error))
      (do
        (log/warnf "No matching query for dialect %s or default" (name (mdb/db-type)))
        :error))))

;;; ------------------------------------------- Advisory Evaluation ------------------------------------------------

(mu/defn evaluate-advisory :- ::schema/match-status
  "Resolve a match status from a version-range check and a matching-query result.

     query-result = :error → :error
     query-result = false  → :not_affected
     in-range?    = true   → :active
     otherwise             → :resolved"
  [in-range?    :- boolean?
   query-result :- QueryResult]
  (cond
    (= query-result :error)
    :error

    (not query-result)
    :not_affected

    in-range?
    :active

    :else
    :resolved))

(defn evaluate-advisory!
  "Evaluate a single advisory: run the matching query, resolve the status, and
   update the DB. 2-arity takes a pre-parsed instance version to avoid re-parsing
   in batch.

   Short-circuits entirely (no query, no DB update) when the version is outside
   every affected range and the advisory is already in a terminal state."
  ([advisory]
   (evaluate-advisory! advisory (parse-version (:tag config/mb-version-info))))
  ([advisory instance-version]
   (let [in-range? (affected-by-version? instance-version (:affected_versions advisory))]
     (when-not (and (not in-range?) (#{:resolved :not_affected} (:match_status advisory)))
       (let [match-status (evaluate-advisory in-range? (execute-matching-query! (:matching_query advisory)))]
         (t2/update! :model/SecurityAdvisory (:id advisory)
                     {:match_status      match-status
                      :last_evaluated_at (mi/now)}))))))

(defn evaluate-all-advisories!
  "Re-evaluate all non-acknowledged advisories, plus any acknowledged advisories
   that are still active or in error state."
  []
  (let [instance-version (parse-version (:tag config/mb-version-info))
        advisories       (t2/select :model/SecurityAdvisory
                                    {:where [:or
                                             [:= :acknowledged_at nil]
                                             [:in :match_status ["active" "error"]]]})]
    (doseq [advisory advisories]
      (try
        (evaluate-advisory! advisory instance-version)
        (catch Exception e
          (log/warnf e "Error evaluating advisory %s" (:advisory_id advisory))
          (t2/update! :model/SecurityAdvisory (:id advisory)
                      {:match_status      :error
                       :last_evaluated_at (mi/now)}))))))
