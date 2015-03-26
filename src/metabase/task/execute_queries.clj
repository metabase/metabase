(ns metabase.task.execute-queries
  (require (metabase [db :refer :all]
                     [driver :as driver]
                     [task :refer :all])
           [metabase.models.query :refer [Query]]))

(defn execute-queries []
  "Execute all `Querys` in the database, one-at-a-time."
  (->> (sel :many Query)
       (map (fn [{database-id :database_id
                 creator-id :creator_id
                 {:keys [sql timezone]} :details :as query}]
              (let [dataset-query {:type :native                 ; TODO: this code looks too much like the code in POST /api/query/:id
                                   :database database-id         ; it would make me happier if there was a nice way to de-duplicate it
                                   :native {:query sql
                                            :timezone timezone}}
                    options {:executed_by creator-id             ; HACK: Technically, creator *isn't* executing this `Query`, but this is a required field
                             :saved_query query
                             :synchronously true                 ; probably makes sense to run these one-at-a-time to avoid putting too much stress on the DB
                             :cache_result true}]
                (driver/dataset-query dataset-query options))))
       dorun))

(add-hook! #'nightly-tasks-hook execute-queries)
