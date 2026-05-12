(ns metabase-enterprise.transform-optimizer.explain
  "Runs `EXPLAIN (FORMAT JSON, VERBOSE)` against a transform's source DB and
  parses the result.

  No `ANALYZE` by default: actually executing the slow query is exactly what
  we are trying to avoid. Callers can opt in (`{:analyze? true}`) when the
  cost of one more run is acceptable — e.g. when the user requested a
  full diagnosis from the UI."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- format-flags [{:keys [analyze? buffers? verbose? settings?]
                      :or   {verbose? true}}]
  (cond-> ["FORMAT JSON"]
    verbose?  (conj "VERBOSE")
    analyze?  (conj "ANALYZE")
    buffers?  (conj "BUFFERS")
    settings? (conj "SETTINGS")))

(defn explain
  "Run `EXPLAIN (FORMAT JSON, …) <sql>` against `database`. Returns the parsed
  JSON plan tree, or `nil` if the planner refused. Postgres only — other
  drivers return `nil` and log a warning.

  Options:
    :analyze?  - run the query and include real timings. **Defaults false.**
    :verbose?  - include extra detail (column lists, qualifiers). Defaults true.
    :buffers?  - include buffer statistics (requires :analyze?). Defaults false.
    :settings? - include non-default planner settings. Defaults false."
  ([driver database sql]
   (explain driver database sql {}))
  ([driver database sql opts]
   (cond
     (not (isa? driver/hierarchy driver :postgres))
     (do (log/warnf "explain only supports :postgres (got %s)" driver)
         nil)

     (str/blank? sql)
     nil

     :else
     (let [flags  (format-flags opts)
           prefix (str "EXPLAIN (" (str/join ", " flags) ") ")
           ;; Strip a trailing semicolon — EXPLAIN <query>; would parse fine
           ;; but we'd rather feed a clean composable string.
           sql*   (-> sql str/trim (str/replace #";\s*$" ""))
           explain-sql (str prefix sql*)]
       (try
         (sql-jdbc.execute/do-with-connection-with-options
          driver database nil
          (fn [^Connection conn]
            (with-open [stmt (.createStatement conn)
                        rs   (.executeQuery stmt explain-sql)]
              (when (.next rs)
                ;; FORMAT JSON returns a single column containing a one-element
                ;; JSON array (Postgres wraps the plan in a top-level array).
                (let [raw (.getString rs 1)]
                  (json/decode+kw raw))))))
         (catch Exception e
           (log/warnf e "EXPLAIN failed for SQL: %s" (subs sql* 0 (min 200 (count sql*))))
           nil))))))

(defn plan-cost
  "Convenience: pull the top-level total-cost out of an EXPLAIN result. Returns
  a double, or `nil` if the result doesn't have the expected shape."
  [explain-result]
  ;; EXPLAIN (FORMAT JSON) returns [{:Plan {:Total Cost <n> :Startup Cost …}}].
  (some-> explain-result first :Plan (get (keyword "Total Cost"))))
