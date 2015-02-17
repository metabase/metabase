(ns metabase.api.query
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [clojure.data.json :as json]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer :all]
                             [query :refer [Query]]
                             [database :refer [Database databases-for-org]]
                             [org :refer [Org]]
                             [common :as common])
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
  (let-400 [{:keys [can_read name] :as query} (sel :one Query :id query-id)]
    (check-403 @can_read)
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
    :details (json/write-str {:sql sql
                              :timezone timezone})
    :public_perms (or public_perms common/perms-none)
    :creator_id *current-user-id*
    :database_id database))

(defendpoint POST "/" [:as {{:keys [clone] :as body} :body}]
  (if clone
    (query-clone clone)
    (query-create body)))


(defendpoint GET "/:id" [id]
  ;; TODO - permissions check
  (let-404 [{:keys [can_read] :as query} (sel :one Query :id id)]
    (check-403 @can_read)
    (hydrate query :creator :database :can_read :can_write)))


(defendpoint PUT "/:id" [id :as {{:keys [sql timezone version] :as body} :body}]
  ;; TODO - check that database exists and user has permission (if specified)
  (let-404 [{:keys [can_write] :as query} (sel :one Query :id id)]
    (check-403 @can_write)
    (let [details (if-not sql {}
                    {:details (json/write-str {:sql sql
                                               :timezone timezone})
                     :version (+ version 1)})]
      (check-500 (-> details
                     (merge body {:updated_at (java.util.Date.)})
                     (util/select-non-nil-keys :name :database_id :public_perms :details :version :updated_at)
                     (->> (mapply upd Query id))))
      (-> (sel :one Query :id id)
          (hydrate :creator :database)))))


(defendpoint DELETE "/:id" [id]
  ;; TODO - permissions check
  (let-404 [{:keys [can_write] :as query} (sel :one [Query :id :creator_id :public_perms] :id id)]
    (check-403 @can_write)
    (del Query :id id)))


(defendpoint POST "/:id" [id]
  ;; TODO - implementation (execute a query)
  {:TODO "TODO"})


(define-routes)
