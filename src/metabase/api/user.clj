(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET PUT]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer [sel upd upd-non-nil-keys exists?]]
            (metabase.models [hydrate :refer [hydrate]]
                             [user :refer [User set-user-password]])
            [metabase.util.password :as password]))

(defn ^:private check-self-or-superuser
  "Check that USER-ID is `*current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (check-403 (or (= user-id *current-user-id*)
                 (:is_superuser @*current-user*))))

(defendpoint GET "/"
  "Fetch a list of all `Users`. You must be a superuser to do this."
  []
  (check-superuser)
  (sel :many User))


(defendpoint GET "/current"
  "Fetch the current user, their `OrgPerms`, and associated `Orgs`."
  []
  (->404 @*current-user*
         (hydrate [:org_perms :organization])))


(defendpoint GET "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser."
  [id]
  (check-self-or-superuser id)
  (check-404 (sel :one User :id id)))


(defendpoint PUT "/:id"
  "Update a `User`."
  [id :as {{:keys [email first_name last_name] :as body} :body}]
  {email      [Required Email]
   first_name NonEmptyString
   last_name  NonEmptyString}
  (check-self-or-superuser id)
  (check-400 (not (exists? User :email email :id [not= id]))) ; can't change email if it's already taken BY ANOTHER ACCOUNT
  (check-500 (upd-non-nil-keys User id
                               :email email
                               :first_name first_name
                               :last_name last_name))
  (sel :one User :id id))


(defendpoint PUT "/:id/password"
  "Update a user's password."
  [id :as {{:keys [password old_password]} :body}]
  {password     [Required ComplexPassword]
   old_password Required}
  (check-self-or-superuser id)
  (let-404 [user (sel :one [User :password_salt :password] :id id)]
    (check (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user))
      [400 "password mismatch"]))
  (set-user-password id password)
  (sel :one User :id id))


(define-routes)
