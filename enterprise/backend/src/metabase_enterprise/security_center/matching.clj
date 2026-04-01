(ns metabase-enterprise.security-center.matching
  "Advisory matching engine. Evaluates HoneySQL queries against the appdb
   and combines with version checks to determine match status."
  (:require
   [metabase-enterprise.security-center.schema :as schema]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Version Parsing ------------------------------------------------

(def ^:private ParsedVersion
  "A parsed version triple [major minor patch]."
  [:tuple :int :int :int])

(def ^:private QueryResult
  "Result of executing a matching query: true (matched), false (no match), or :error."
  [:or :boolean [:= :error]])

(mu/defn parse-version :- [:maybe ParsedVersion]
  "Parse a version string like `\"v1.57.16\"` into `[major minor patch]` ints.
   Returns nil if the string can't be parsed."
  [version-string :- [:maybe :string]]
  (when-let [[_ major minor patch] (some->> version-string (re-find #"v?(\d+)\.(\d+)\.(\d+)"))]
    [(parse-long major) (parse-long minor) (parse-long patch)]))

(defn- version-in-range?
  "True if `version` (parsed triple) is >= min and < fixed."
  [version {:keys [min fixed]}]
  (let [min-v   (parse-version min)
        fixed-v (parse-version fixed)]
    (and min-v fixed-v
         (>= (compare version min-v) 0)
         (neg? (compare version fixed-v)))))

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

(defn- query-read-only!
  "Execute a HoneySQL query on a read-only appdb connection.
   Sets the JDBC connection read-only so the driver rejects write statements.
   Enforced by Postgres and MySQL; H2 treats it as an advisory hint."
  [hsql-query]
  (t2/with-transaction [^java.sql.Connection conn]
    (if (.isReadOnly conn)
      (mdb/query hsql-query)
      (do
        (.setReadOnly conn true)
        (try
          (mdb/query hsql-query)
          (finally
            (.setReadOnly conn false)))))))

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
  "Pure evaluation: given an advisory, instance version, and query result, return the resolved match status.
   Does not perform I/O — call [[execute-matching-query!]] separately to obtain `query-result`.
   `query-result` is true (matched), false (no match), or :error."
  [advisory         :- [:map [:affected_versions ::schema/affected-versions]]
   instance-version :- [:maybe ParsedVersion]
   query-result     :- QueryResult]
  (cond
    (= query-result :error)
    :error

    (not query-result)
    :not_affected

    (or (nil? instance-version)
        (affected-by-version? instance-version (:affected_versions advisory)))
    :active

    :else
    :resolved))

(defn evaluate-advisory!
  "Evaluate a single advisory: run matching query, resolve status, update DB.
   2-arity takes a pre-parsed instance version to avoid re-parsing in batch."
  ([advisory]
   (evaluate-advisory! advisory (parse-version (:tag config/mb-version-info))))
  ([advisory instance-version]
   (let [query-result (execute-matching-query! (:matching_query advisory))
         match-status (evaluate-advisory advisory instance-version query-result)]
     (t2/update! :model/SecurityAdvisory (:id advisory)
                 {:match_status      match-status
                  :last_evaluated_at (mi/now)}))))

(defn evaluate-all-advisories!
  "Re-evaluate all non-acknowledged advisories."
  []
  (let [instance-version (parse-version (:tag config/mb-version-info))
        advisories       (t2/select :model/SecurityAdvisory :acknowledged_at nil)]
    (doseq [advisory advisories]
      (try
        (evaluate-advisory! advisory instance-version)
        (catch Exception e
          (log/warnf e "Error evaluating advisory %s" (:advisory_id advisory))
          (t2/update! :model/SecurityAdvisory (:id advisory)
                      {:match_status      :error
                       :last_evaluated_at (mi/now)}))))))
