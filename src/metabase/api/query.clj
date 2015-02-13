(ns metabase.api.query
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [clojure.data.json :as json]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [query :refer [Query]]
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
  ;; TODO - permissions check
  ;; TODO - filter by f == "mine"
  ;; TODO - filter by creator == self OR public_perms > 0
  (-> (sel :many Query
        (where {:database_id [in (subselect Database (fields :id) (where {:organization_id org}))]})
        (where {:public_perms [> common/perms-none]}))
      (hydrate :creator :database)))


(defn query-clone
  "Create a new query by cloning an existing query.  Returns a 403 if user doesn't have acces to read query."
  [query-id]
  (let-400 [query (sel :one Query :id query-id)]
    ;; TODO - validate that user has read perms on query
    (let [new-query-id (ins Query
                         :created_at (new java.util.Date)
                         :updated_at (new java.util.Date)
                         :type (:type query)
                         :name (str (:name query) " CLONED")
                         :details (:details query)
                         :version 1
                         :public_perms common/perms-none
                         :creator_id 1 ;; TODO - current user id
                         :database_id (:database_id query))]
      (sel :one Query :id (:id new-query-id)))))


(defn query-create
  "Create a new query from user posted data."
  [body]
  (check (exists? Database :id (:database body)) [400 "Specified database does not exist."])
  ;; TODO - validate that user has perms to create against this database
  (let [new-query-id (ins Query
                       :created_at (new java.util.Date)
                       :updated_at (new java.util.Date)
                       :type "rawsql"
                       :name (or (:name body) (str "New Query: " (new java.util.Date)))
                       :details (json/write-str {:sql (:sql body) :timezone (:timezone body)})
                       :version 1
                       :public_perms (or (:public_perms body) common/perms-none)
                       :creator_id 1 ;; TODO - current user id
                       :database_id (:database body))]
    (sel :one Query :id (:id new-query-id))))


(defendpoint POST "/" [:as {body :body}]
  (if (:clone body)
    (query-clone (:clone body))
    (query-create body)))


(defendpoint GET "/:id" [id]
  ;; TODO - permissions check
  (->404 (sel :one Query :id id)
         ;; TODO - hydrate :can_read and :can_write
         (hydrate :creator :database)))


(defendpoint PUT "/:id" [id :as {body :body}]
  ;; TODO - permissions check
  ;; TODO - check that database exists and user has permission (if specified)
  (let-404 [query (sel :one Query :id id)]
    (let [details (if (:sql body) {:details (json/write-str {:sql (:sql body) :timezone (:timezone body)})
                                   :version (+ (:version query) 1)}
                                  {})]
      (check-500 (-> details
                     (merge body {:updated_at (new java.util.Date)})
                     (util/select-non-nil-keys :name :database_id :public_perms :details :version :updated_at)
                     (->> (mapply upd Query id))))
      (-> (sel :one Query :id id)
          (hydrate :creator :database)))))


(defendpoint DELETE "/:id" [id]
  ;; TODO - permissions check
  (check-404 (exists? Query :id id))
  (del Query :id id)
  {:success true})


(defendpoint POST "/:id" [id]
  ;; TODO - implementation (execute a query)
  {:TODO "TODO"})


(define-routes)
