(ns metabase.api.org
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [org :refer [Org]]
                             [user :refer [User]]
                             [org-perm :refer [OrgPerm]])))


(defendpoint GET "/" []
  ;; TODO - permissions check
  (sel :many Org))


(defendpoint POST "/" [:as {body :body}]
  ;; TODO - implementation
  {:status 200
   :body {}})


(defendpoint GET "/:id" [id]
  ;; TODO - permissions check
  (->404 (sel :one Org :id id)))


(defendpoint GET "/slug/:slug" [slug]
  ;; TODO: permissions check
  (->404 (sel :one Org :slug slug)))


(defendpoint PUT "/:id" [id :as {body :body}]
  ;; TODO - permissions check
  ;; TODO - validations (email address must be unique)
  (let-404 [org (sel :one Org :id id)]
    ;; TODO - how can we pass a useful error message in the 500 response on error?
    (upd Org id
      ;; TODO - find a way to make this cleaner.  we don't want to modify the value if it doesn't exist
      :name (get body :name (:name org))
      :description (get body :description (:description org))
      :logo_url (get body :logo_url (:logo_url org)))
    (sel :one Org :id id)))


(defn grant-org-perm
  "Grants permission for given User on Org.  Creates record if needed, otherwise updates existing record."
  [org-id user-id is-admin]
  (let [perm (sel :one OrgPerm :user_id user-id :organization_id org-id)]
    (if-not perm
      (ins OrgPerm
        :user_id user-id
        :organization_id org-id
        :admin is-admin)
      (upd OrgPerm (:id perm)
        :admin is-admin))))


(defendpoint GET "/:id/members" [id]
  ;; TODO - permissions check
  (let-404 [org (sel :one Org :id id)]
    (-> (sel :many OrgPerm :organization_id id)
      ;; TODO - we need a way to remove :organization_id and user_id from this output
      (hydrate :user :organization))))


(defendpoint POST "/:id/members" [id :as {body :body}]
  ;; TODO - permissions check
  ; find user with existing email - if exists then grant perm
  (let-404 [org (sel :one Org :id id)]
    (let [user (sel :one User :email (:email body))]
      (if-not user
        (let [new-user-id (ins User
                            :email (:email body)
                            :first_name (:first_name body)
                            :last_name (:last_name body)
                            :password (str (java.util.UUID/randomUUID))
                            :date_joined (new java.util.Date)
                            :is_staff true
                            :is_active true
                            :is_superuser false)]
          (grant-org-perm (:id org) (:id new-user-id) (:admin body))
          ;; TODO - send signup email
          (-> (sel :one OrgPerm :user_id (:id new-user-id) :organization_id (:id org))
            (hydrate :user :organization)))
        (do
          (grant-org-perm (:id org) (:id user) (:admin body))
          (-> (sel :one OrgPerm :user_id (:id user) :organization_id (:id org))
              (hydrate :user :organization)))))))


(defendpoint POST "/:id/members/:user-id" [id user-id :as {body :body}]
  ;; TODO - permissions check
  (let-404 [org (sel :one Org :id id)]
    (let-404 [user (sel :one User :id user-id)]
      (grant-org-perm id user-id (or (:admin body) false))
      {:success true})))


(defendpoint PUT "/:id/members/:user-id" [id user-id :as {body :body}]
  ;; TODO - permissions check
  ;; HMMM, same body as endpoint above in this case.  how can we unify the impl of 2 endpoints?
  (let-404 [org (sel :one Org :id id)]
    (let-404 [user (sel :one User :id user-id)]
      (grant-org-perm id user-id (or (:admin body) false))
      {:success true})))


(defendpoint DELETE "/:id/members/:user-id" [id user-id :as {body :body}]
  ;; TODO - permissions check
  ;; HMMM, same body as endpoint above in this case.  how can we unify the impl of 2 endpoints?
  (let-404 [org (sel :one Org :id id)]
    (let-404 [user (sel :one User :id user-id)]
      (del OrgPerm :user_id user-id :organization_id id)
      {:success true})))


(define-routes)
