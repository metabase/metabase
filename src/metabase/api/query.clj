(ns metabase.api.query
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [clojure.data.json :as json]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [query :refer [Query]]
                             [database :refer [Database databases-for-org]]
                             [org :refer [Org]]
                             [common :as common])))


(defendpoint GET "/form_input" [org]
  ;; TODO - validate user has perms on org
  (let [dbs (databases-for-org org)]
    {:permissions common/permissions
     :timezones common/timezones
     :databases dbs}))


;(defendpoint GET "/" [org f]
;  ;; TODO - permissions check
;  (let [filter-org (where {:database_id [in (subselect Database
;                                     (fields :id)
;                                     (where {:organization_id org}))]})
;        filter-perms (where {:public_perms (> 0)}))]
;    )
;  (sel :many Query ))


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


;(defendpoint GET "/:id" [id]
;  ;; TODO - permissions check
;  (->404 (sel :one Org :id id)))
;
;
;(defendpoint PUT "/:id" [id :as {body :body}]
;  ;; TODO - permissions check
;  ;; TODO - validations (email address must be unique)
;  (let-404 [org (sel :one Org :id id)]
;    ;; TODO - how can we pass a useful error message in the 500 response on error?
;    (upd Org id
;      ;; TODO - find a way to make this cleaner.  we don't want to modify the value if it doesn't exist
;      :name (get body :name (:name org))
;      :description (get body :description (:description org))
;      :logo_url (get body :logo_url (:logo_url org)))
;    (sel :one Org :id id)))
;
;
;(defendpoint DELETE "/:id" [id]
;  ;; TODO - permissions check
;  ;; HMMM, same body as endpoint above in this case.  how can we unify the impl of 2 endpoints?
;  (let-404 [org (sel :one Org :id id)]
;    (let-404 [user (sel :one User :id user-id)]
;      (del OrgPerm :user_id user-id :organization_id id)
;      {:success true})))
;
;
;(defendpoint POST "/:id" [id]
;  ;; TODO - permissions check
;  (->404 (sel :one Org :id id)))


(define-routes)
