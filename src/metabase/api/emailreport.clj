(ns metabase.api.emailreport
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [clojure.data.json :as json]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
              [hydrate :refer :all]
              [database :refer [Database databases-for-org]]                                                                      [org :refer [Org]]
              [emailreport :refer [EmailReport modes days-of-week times-of-day]]
              [user :refer [users-for-org]])
            [metabase.util :as util]))


(defendpoint GET "/form_input" [org]
  (require-params org)
  ; we require admin/default perms on the org to do this operation
  (check-403 ((:perms-for-org @*current-user*) org))
  (let [dbs (databases-for-org org)
        users (users-for-org org)]
    {:permissions common/permissions
     :modes modes
     :days_of_week days-of-week
     :times_of_day times-of-day
     :timezones common/timezones
     :databases dbs
     :users users}))


(defendpoint GET "/" [org f]
  ;; TODO - filter by f == "mine"
  ;; TODO - filter by creator == self OR public_perms > 0
  (require-params org)
  ; we require admin/default perms on the org to do this operation
  (check-403 ((:perms-for-org @*current-user*) org))
  (-> (sel :many EmailReport
        (where {:organization_id org})
        (where {:public_perms [> common/perms-none]})
        (order :name :ASC))
    (hydrate :creator :organization :can_read :can_write)))

;(defn query-clone
;  "Create a new query by cloning an existing query.  Returns a 403 if user doesn't have acces to read query."
;  [query-id]
;  (let-400 [{:keys [can_read name] :as query} (sel :one Query :id query-id)]
;    (check-403 @can_read)
;    (->> (-> query
;           (select-keys [:type :details :database_id])
;           (assoc :name (str name " CLONED")
;                  :public_perms common/perms-none
;                  :creator_id *current-user-id*))
;      (mapply ins Query))))
;
;(defn query-create
;  "Create a new query from user posted data."
;  [{:keys [name sql timezone public_perms database]}]
;  (require-params database)             ; sql, timezone?
;  (check (exists? Database :id database) [400 "Specified database does not exist."])
;  ;; TODO - validate that user has perms to create against this database
;  (ins Query
;    :type "rawsql"
;    :name (or name (str "New Query: " (java.util.Date.)))
;    :details {:sql sql
;              :timezone timezone}
;    :public_perms (or public_perms common/perms-none)
;    :creator_id *current-user-id*
;    :database_id database))
;
;(defendpoint POST "/" [:as {{:keys [clone] :as body} :body}]
;  (if clone
;    (query-clone clone)
;    (query-create body)))


(defendpoint GET "/:id" [id]
  ; user must have read permissions on the report
  (let-404 [{:keys [can_read] :as report} (sel :one EmailReport :id id)]
    (check-403 @can_read)
    (hydrate report :creator :organization :can_read :can_write)))


;(defendpoint PUT "/:id" [id :as {{:keys [sql timezone version] :as body} :body}]
;  ;; TODO - check that database exists and user has permission (if specified)
;  (let-404 [{:keys [can_write] :as query} (sel :one Query :id id)]
;    (check-403 @can_write)
;    (check-500 (-> (merge query body)
;                 (#(mapply upd Query id %))))
;    (-> (sel :one Query :id id)
;      (hydrate :creator :database))))
;
;
;(defendpoint DELETE "/:id" [id]
;  (let-404 [{:keys [can_write] :as query} (sel :one [Query :id :creator_id :public_perms] :id id)]
;    (check-403 @can_write)
;    (del Query :id id)))
;
;
;(defendpoint POST "/:id" [id]
;  ;; TODO - implementation (execute a query)
;  {:TODO "TODO"})
;
;
;(defendpoint GET "/:id/results" [id]
;  ;; TODO - implementation (list recent results of a query)
;  (let-404 [{:keys [can_read] :as query} (sel :one Query :id id)]
;    (check-403 @can_read)
;    (sel :many QueryExecution :query_id id (order :finished_at :DESC) (limit 10))))
;
;
;(defendpoint POST "/:id/csv" [id]
;  ;; TODO - this should return a CSV file instead of JSON
;  {:TODO "TODO"})


(define-routes)
