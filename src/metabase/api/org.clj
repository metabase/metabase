(ns metabase.api.org
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [org :refer [Org]]
                             [user :refer [User]]
                             [org-perm :refer [OrgPerm]])
            [metabase.util :as util]))


(defendpoint GET "/" []
  ;; TODO - permissions check
  (sel :many Org))


(defendpoint POST "/" [:as {body :body}]
  ;; TODO - implementation
  {:status 200
   :body {}})

(defendpoint GET "/:id" [id]
  (let-404 [{:keys [can_read] :as org} (sel :one Org :id id)]
    (check-403 @can_read)
    org))

(defendpoint GET "/slug/:slug" [slug]
  (let-404 [{:keys [can_read] :as org} (sel :one Org :slug slug)]
    (check-403 @can_read)
    org))

(defendpoint PUT "/:id" [id :as {body :body}]
  ;; TODO - validations (email address must be unique)
  (let-404 [{:keys [can_write] :as org} (sel :one Org :id id)]
    (check-403 @can_write)
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
  (let [perm (sel :one OrgPerm :user_id user-id :organization_id org-id)
        is-admin (boolean is-admin)]
    (if-not perm
      (ins OrgPerm
        :user_id user-id
        :organization_id org-id
        :admin is-admin)
      (upd OrgPerm (:id perm)
        :admin is-admin))))


(defendpoint GET "/:id/members" [id]
  (let-404 [{:keys [can_read] :as org} (sel :one Org :id id)]
    (check-403 @can_read)
    (-> (sel :many OrgPerm :organization_id id)
        (hydrate :user)
        (->> (map (fn [org-perm]                                ; strip IDs for safety (?)
                    (-> org-perm
                        (dissoc :id :organization_id :user_id)
                        (dissoc-in [:user :id] ))))))))


(defendpoint POST "/:org-id/members" [org-id :as {{:keys [first_name last_name email orgId admin]} :body}]
  (check (= org-id orgId) 400 (format "Org IDs don't match: %d != %d" org-id orgId)) ; why do we need to POST Org ID if it's already in the URL????
  (let-404 [{:keys [can_write] :as org} (sel :one Org :id org-id)]
    (check-403 @can_write)
    (let [user (sel :one User :email email)]                                         ; find user with existing email - if exists then grant perm
      (let [user-id (if user (:id user)
                        (:id (ins User
                               :email email
                               :first_name first_name
                               :last_name last_name
                               :password (str (java.util.UUID/randomUUID)))))]       ; TODO - send the welcome email
        (grant-org-perm org-id user-id admin)
        (-> (sel :one OrgPerm :user_id user-id :organization_id org-id)
            (hydrate :user))))))


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
      (del OrgPerm :user_id user-id :organization_id id))))


(define-routes)
