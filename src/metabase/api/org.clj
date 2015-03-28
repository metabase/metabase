(ns metabase.api.org
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [korma.core :refer [where subselect fields order limit]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [org :refer [Org]]
                             [user :refer [User create-user]]
                             [org-perm :refer [OrgPerm grant-org-perm]])
            [metabase.util :as util]
            [ring.util.request :as req]))

(defendpoint GET "/" []
  (if (:is_superuser @*current-user*)
    ;; superusers get all organizations
    (sel :many Org)
    ;; normal users simply see the orgs they are members of
    (sel :many Org (where {:id [in (subselect OrgPerm (fields :organization_id) (where {:user_id *current-user-id*}))]}))))


(defendpoint POST "/" [:as {{:keys [name slug] :as body} :body}]
  {name [Required NonEmptyString]
   slug [Required NonEmptyString]} ; TODO - check logo_url ?
  (check-superuser)
  (let-500 [{:keys [id] :as new-org} (->> (util/select-non-nil-keys body :slug :name :description :logo_url)
                                          (mapply ins Org))]
    (grant-org-perm id *current-user-id* true) ; now that the Org exists, add the creator as the first admin member
    new-org))                                  ; make sure the api response is still the newly created org

(defendpoint GET "/:id" [id]
  (->404 (sel :one Org :id id)
         read-check))


(defendpoint GET "/slug/:slug" [slug]
  (->404 (sel :one Org :slug slug)
         read-check))


(defendpoint PUT "/:id" [id :as {{:keys [name description logo_url]} :body}]
  {name NonEmptyString}
  (write-check Org id)
  (check-500 (upd-non-nil-keys Org id
                               :description description
                               :logo_url logo_url
                               :name name))
  (sel :one Org :id id))


(defendpoint GET "/:id/members" [id]
  (read-check Org id)
  (-> (sel :many OrgPerm :organization_id id)
      (hydrate :user)))


(defendpoint POST "/:id/members" [id :as {{:keys [first_name last_name email admin]
                                           :or {admin false}} :body :as request}]
  {admin      Boolean
   first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]}
  (write-check Org id)
  (let [password-reset-url (str (java.net.URL. (java.net.URL. (req/request-url request)) "/auth/forgot_password"))
        user-id (:id (or (sel :one [User :id] :email email)                ; find user with existing email - if exists then grant perm
                         (create-user first_name last_name email :send-welcome true :reset-url password-reset-url)))]
    (grant-org-perm id user-id admin)
    (-> (sel :one OrgPerm :user_id user-id :organization_id id)
        (hydrate :user :organization))))


(defendpoint GET "/:id/members/:user-id" [id user-id]
  (read-check Org id)
  (check-exists? User user-id)
  (-> (sel :one OrgPerm :user_id user-id :organization_id id)
      (hydrate :user :organization)))


(defendpoint POST "/:id/members/:user-id" [id user-id :as {{:keys [admin]} :body}]
  {admin Boolean}
  (write-check Org id)
  (check-exists? User user-id)
  (grant-org-perm id user-id admin)
  {:success true})

;; TODO `POST` and `PUT` endpoints are exactly the same. Do we need both?

(defendpoint PUT "/:id/members/:user-id" [id user-id :as {{:keys [admin]} :body}]
  {admin Boolean}
  (write-check Org id)
  (check-exists? User user-id)
  (grant-org-perm id user-id admin)
  {:success true})


(defendpoint DELETE "/:id/members/:user-id" [id user-id :as {body :body}]
  (write-check Org id)
  (check-exists? User user-id)
  (del OrgPerm :user_id user-id :organization_id id))


(define-routes)
