(ns metabase.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require [metabase.db :as mdb]
            [metabase.query-processor.util :as qputil]
            [metabase.util.honeysql-extensions :as hx]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel Query :query)

;;; Helper Fns

(defn average-execution-time-ms
  "Fetch the average execution time (in milliseconds) for query with QUERY-HASH if available.
   Returns `nil` if no information is available."
  ^Integer [^bytes query-hash]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  (db/select-one-field :average_execution_time Query :query_hash query-hash))

(defn- int-casting-type
  "Return appropriate type for use in SQL `CAST(x AS type)` statement.
   MySQL doesn't accept `integer`, so we have to use `unsigned`; Postgres doesn't accept `unsigned`.
   so we have to use `integer`. Yay SQL dialect differences :D"
  []
  (if (= (mdb/db-type) :mysql)
    :unsigned
    :integer))

(defn- update-rolling-average-execution-time!
  "Update the rolling average execution time for query with QUERY-HASH. Returns `true` if a record was updated,
   or `false` if no matching records were found."
  ^Boolean [^bytes query-hash, ^Integer execution-time-ms]
  (db/update-where! Query {:query_hash query-hash}
    :average_execution_time (hx/cast (int-casting-type) (hx/round (hx/+ (hx/* 0.9 :average_execution_time)
                                                                        (*    0.1 execution-time-ms))
                                                                  0))))

(defn- record-new-execution-time!
  "Record the execution time for a query with QUERY-HASH that's not already present in the DB.
   EXECUTION-TIME-MS is used as a starting point."
  [^bytes query-hash, ^Integer execution-time-ms]
  (db/insert! Query
    :query_hash             query-hash
    :average_execution_time execution-time-ms))

(defn update-average-execution-time!
  "Update the recorded average execution time for query with QUERY-HASH."
  [^bytes query-hash, ^Integer execution-time-ms]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  (or
   ;; if there's already a matching Query update the rolling average
   (update-rolling-average-execution-time! query-hash execution-time-ms)
   ;; otherwise try adding a new entry. If for some reason there was a race condition and a Query entry was added in
   ;; the meantime we'll try updating that existing record
   (try (record-new-execution-time! query-hash execution-time-ms)
        (catch Throwable e
          (or (update-rolling-average-execution-time! query-hash execution-time-ms)
              ;; rethrow e if updating an existing average execution time failed
              (throw e))))))


(def ^:private ^{:arglists '([query-type])} native-query?
  (comp #{:native} qputil/normalize-token))

(defn query->database-and-table-ids
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card. Handles queries that use
   other queries as their source (ones that come in with a `:source-table` like `card__100`) recursively, as well as
   normal queries."
  [outer-query]
  (let [database-id  (qputil/get-normalized outer-query :database)
        query-type   (qputil/get-normalized outer-query :type)
        source-table (qputil/get-in-normalized outer-query [:query :source-table])]
    (cond
      (native-query? query-type) {:database-id database-id, :table-id nil}
      (integer? source-table)    {:database-id database-id, :table-id source-table}
      (string? source-table)     (let [[_ card-id] (re-find #"^card__(\d+)$" source-table)]
                                   (db/select-one ['Card [:table_id :table-id] [:database_id :database-id]]
                                     :id (Integer/parseInt card-id))))))

(defn adhoc-query
  "Wrap query map into a Query object (mostly to fascilitate type dispatch)."
  [query]
  (->> {:dataset_query query}
       (merge (query->database-and-table-ids query))
       map->QueryInstance))
