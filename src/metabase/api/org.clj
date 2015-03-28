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

(defendpoint GET "/"
  "Fetch a list of all `Orgs`. Superusers get all organizations; normal users simpliy see the orgs they are members of."
  []
  (if (:is_superuser @*current-user*)
    (sel :many Org)
    (sel :many Org (where {:id [in (subselect OrgPerm (fields :organization_id) (where {:user_id *current-user-id*}))]}))))


(defendpoint POST "/"
  "Create a new `Org`. You must be a superuser to do this."
  [:as {{:keys [name slug] :as body} :body}]
  {name [Required NonEmptyString]
   slug [Required NonEmptyString]} ; TODO - check logo_url ?
  (check-superuser)
  (let-500 [{:keys [id] :as new-org} (->> (util/select-non-nil-keys body :slug :name :description :logo_url)
                                          (mapply ins Org))]
    (grant-org-perm id *current-user-id* true) ; now that the Org exists, add the creator as the first admin member
    new-org))                                  ; make sure the api response is still the newly created org

(defendpoint GET "/:id"
  "Fetch `Org` with ID."
  [id]
  (->404 (sel :one Org :id id)
         read-check))


(defendpoint GET "/slug/:slug"
  "Fetch `Org` with given SLUG."
  [slug]
  (->404 (sel :one Org :slug slug)
         read-check))


(defendpoint PUT "/:id"
  "Update an `Org`."
  [id :as {{:keys [name description logo_url]} :body}]
  {name NonEmptyString}
  (write-check Org id)
  (check-500 (upd-non-nil-keys Org id
                               :description description
                               :logo_url logo_url
                               :name name))
  (sel :one Org :id id))


(defendpoint GET "/:id/members"
  "Get a list of `Users` who are members of (i.e., have `OrgPerms` for) `Org`."
  [id]
  (read-check Org id)
  (-> (sel :many OrgPerm :organization_id id)
      (hydrate :user)))


(defendpoint POST "/:id/members"
  "Add a `User` to an `Org`. If user already exists, they'll simply be granted `OrgPerms`;
   otherwise, a new `User` will be created."
  [id :as {{:keys [first_name last_name email admin] :or {admin false}} :body}]
  {admin      Boolean
   first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]}
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


(defendpoint GET "/:id/members/:user-id"
  "Get the `OrgPerm` for `Org` with ID and `User` with USER-ID, if it exists.
   `User` is returned along with the `OrgPerm`."
  [id user-id]
  (read-check Org id)
  (check-exists? User user-id)
  (-> (sel :one OrgPerm :user_id user-id :organization_id id)
      (hydrate :user :organization)))


(defendpoint POST "/:id/members/:user-id"
  "Add an existing `User` to an `Org` (i.e., create an `OrgPerm` for them)."
  [id user-id :as {{:keys [admin]} :body}]
  {admin Boolean}
  (write-check Org id)
  (check-exists? User user-id)
  (grant-org-perm id user-id admin)
  {:success true})

;; TODO `POST` and `PUT` endpoints are exactly the same. Do we need both?

(defendpoint PUT "/:id/members/:user-id"
  "Add an existing `User` to an `Org` (i.e., create an `OrgPerm` for them)."
  [id user-id :as {{:keys [admin]} :body}]
  {admin Boolean}
  (write-check Org id)
  (check-exists? User user-id)
  (grant-org-perm id user-id admin)
  {:success true})


(defendpoint DELETE "/:id/members/:user-id"
  "Remove a `User` from an `Org` (i.e., delete the `OrgPerm`)"
  [id user-id :as {body :body}]
  (write-check Org id)
  (check-exists? User user-id)
  (del OrgPerm :user_id user-id :organization_id id))


(define-routes)
