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

(defn update-average-execution-time!
  "Update the recorded average execution time for query with QUERY-HASH."
  ^Integer [^bytes query-hash, ^Integer execution-time-ms]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  (or
   ;; if there's already a matching Query update the rolling average
   (db/update-where! Query {:query_hash query-hash}
     :average_execution_time (hx/cast (int-casting-type) (hx/round (hx/+ (hx/* 0.9 :average_execution_time)
                                                                         (*    0.1 execution-time-ms))
                                                                   0)))
   ;; otherwise add a new entry, using the value of EXECUTION-TIME-MS as a starting point
   (db/insert! Query
     :query_hash             query-hash
     :average_execution_time execution-time-ms)))
