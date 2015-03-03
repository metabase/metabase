(ns metabase.api.org
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [korma.core :refer [where subselect fields order limit]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [org :refer [Org]]
                             [user :refer [User]]
                             [org-perm :refer [OrgPerm grant-org-perm]])
            [metabase.util :as util]))


(defendpoint GET "/" []
  (if (:is_superuser *current-user*)
    ;; superusers get all organizations
    (sel :many Org)
    ;; normal users simply see the orgs they are members of
    (sel :many Org (where {:id [in (subselect OrgPerm (fields :organization_id) (where {:user_id *current-user-id*}))]})))


(defendpoint POST "/" [:as {{:keys [name slug] :as body} :body}]
  (require-params name slug)
  ;; user must be a superuser to proceed
  (check-403 (:is_superuser *current-user*))
  (->> (util/select-non-nil-keys body [:slug :name :description :logo_url])
    (mapply ins Org)))


(defendpoint GET "/:id" [id]
  (->404 (sel :one Org :id id)
         read-check))


(defendpoint GET "/slug/:slug" [slug]
  (->404 (sel :one Org :slug slug)
         read-check))


(defendpoint PUT "/:id" [id :as {body :body}]
  (write-check Org id)
  (check-500 (->> (util/select-non-nil-keys body :name :description :logo_url)
                  (mapply upd Org id)))
  (sel :one Org :id id))


(defendpoint GET "/:id/members" [id]
  (read-check Org id)
  (-> (sel :many OrgPerm :organization_id id)
      (hydrate :user :organization)))


(defendpoint POST "/:id/members" [id :as {{:keys [first_name last_name email admin]} :body}]
  ; we require 4 attributes in the body
  (check-400 (and first_name last_name email admin (util/is-email? email)))
  ; user must have admin perms on org to proceed
  (write-check Org id)
  (let [user-id (:id (or (sel :one [User :id] :email email)                ; find user with existing email - if exists then grant perm
                         (ins User
                           :email email
                           :first_name first_name
                           :last_name last_name
                           :password (str (java.util.UUID/randomUUID)))))] ; TODO - send welcome email
    (grant-org-perm id user-id admin)
    (-> (sel :one OrgPerm :user_id user-id :organization_id id)
        (hydrate :user :organization))))


(defendpoint POST "/:id/members/:user-id" [id user-id :as {{:keys [admin]} :body}]
  (write-check Org id)
  (check-404 (exists? User :id user-id))
  (grant-org-perm id user-id (boolean admin))
  {:success true})


(defendpoint PUT "/:id/members/:user-id" [id user-id :as {{:keys [admin]} :body}]
  (write-check Org id)
  (check-404 (exists? User :id user-id))
  (grant-org-perm id user-id (boolean admin))
  {:success true})


(defendpoint DELETE "/:id/members/:user-id" [id user-id :as {body :body}]
  ; user must have admin perms on org to proceed
  (let-404 [{:keys [can_write] :as org} (sel :one Org :id id)]
    (check-403 @can_write)
    (let-404 [user (sel :one User :id user-id)]
      (del OrgPerm :user_id user-id :organization_id id)
      {:success true})))


(define-routes)
