(ns metabase.api.query
  (:require [clojure.data.csv :as csv]
            [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [clojure.data.json :as json]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [common :as common]
                             [hydrate :refer :all]
                             [database :refer [Database databases-for-org]]
                             [org :refer [Org]]
                             [query :refer [Query]]
                             [query-execution :refer [QueryExecution all-fields]])
            [metabase.util :as util]))


(defendpoint GET "/form_input" [org]
  ;; TODO - validate user has perms on org
  (let [dbs (databases-for-org org)]
    {:permissions common/permissions
     :timezones common/timezones
     :databases dbs}))


(defendpoint GET "/" [org f]
  ;; TODO - filter by f == "mine"
  ;; TODO - filter by creator == self OR public_perms > 0
  (check-403 ((:perms-for-org @*current-user*) org))
  (-> (sel :many Query
        (where {:database_id [in (subselect Database (fields :id) (where {:organization_id org}))]})
        (where {:public_perms [> common/perms-none]}))
      (hydrate :creator :database)))

(defn query-clone
  "Create a new query by cloning an existing query.  Returns a 403 if user doesn't have acces to read query."
  [query-id]
  (let-400 [{:keys [name] :as query} (sel :one Query :id query-id)]
    (read-check query)
    (->> (-> query
             (select-keys [:type :details :database_id])
             (assoc :name (str name " CLONED")
                    :public_perms common/perms-none
                    :creator_id *current-user-id*))
         (mapply ins Query))))

(defn query-create
  "Create a new query from user posted data."
  [{:keys [name sql timezone public_perms database]}]
  (require-params database)             ; sql, timezone?
  (check (exists? Database :id database) [400 "Specified database does not exist."])
  ;; TODO - validate that user has perms to create against this database
  (ins Query
    :type "rawsql"
    :name (or name (str "New Query: " (java.util.Date.)))
    :details {:sql sql
              :timezone timezone}
    :public_perms (or public_perms common/perms-none)
    :creator_id *current-user-id*
    :database_id database))

(defendpoint POST "/" [:as {{:keys [clone] :as body} :body}]
  (if clone
    (query-clone clone)
    (query-create body)))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Query :id id)
         read-check
         (hydrate :creator :database :can_read :can_write)))

(defendpoint PUT "/:id" [id :as {{:keys [sql timezone version] :as body} :body}]
  ;; TODO - check that database exists and user has permission (if specified)
  (let-404 [query ]
    (check-500 (->404 (sel :one Query :id id)
                      write-check
                      (merge body)
                      (#(mapply upd Query id %))))
    (-> (sel :one Query :id id)
        (hydrate :creator :database))))


(defendpoint DELETE "/:id" [id]
  (write-check Query id)
  (del Query :id id))


(defendpoint POST "/:id" [id]
  (let-404 [query (sel :one Query :id id)]
           (read-check query)
           (let [json-query {:type "native"
                             :database (:database_id query)
                             :native {:query (get-in query [:details :sql])
                             :timezone (get-in query [:details :timezone])}}
                 options {:executed_by *current-user-id*
                          :saved_query query
                          ;; TODO - make asynchronous
                          :cache_result true}]
             (driver/dataset-query json-query options)))) 

(defendpoint GET "/:id/results" [id]
  ;; TODO - implementation (list recent results of a query)
  (read-check Query id)
  (sel :many QueryExecution :query_id id (order :finished_at :DESC) (limit 10)))


(def query-csv
  (GET "/:id/csv" [id]
    (let-404 [{:keys [result_data query_id] :as query-execution} (eval `(sel :one ~all-fields :query_id ~id (order :started_at :DESC) (limit 1)))]
      (let-404 [{{can_read :can_read name :name} :query} (hydrate query-execution :query)]
        (check-403 @can_read)
        {:status 200
         :body (with-out-str (csv/write-csv *out* (into [(:columns result_data)] (:rows result_data))))
         :headers {"Content-Type" "text/csv", "Content-Disposition" (str "attachment; filename=\"" name ".csv\"")}}))))


(define-routes query-csv)
