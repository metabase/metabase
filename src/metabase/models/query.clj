(ns metabase.models.query
  (:require [metabase.db :as mdb]
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
   ;; otherwise try adding a new entry. If for some reason there was a race condition and a Query entry was added in the meantime
   ;; we'll try updating that existing record
   (try (record-new-execution-time! query-hash execution-time-ms)
        (catch Throwable e
          (or (update-rolling-average-execution-time! query-hash execution-time-ms)
              ;; rethrow e if updating an existing average execution time failed
              (throw e))))))
