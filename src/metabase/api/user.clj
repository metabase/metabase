(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET DELETE POST PUT]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer [sel upd upd-non-nil-keys exists?]]
            [metabase.email.messages :as email]
            (metabase.models [hydrate :refer [hydrate]]
                             [user :refer [User create-user set-user-password set-user-password-reset-token form-password-reset-url]])))

(defn ^:private check-self-or-superuser
  "Check that USER-ID is `*current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (check-403 (or (= user-id *current-user-id*)
                 (:is_superuser @*current-user*))))

(defendpoint GET "/"
  "Fetch a list of all active `Users`. You must be a superuser to do this."
  []
  (check-superuser)
  (sel :many User :is_active true))


(defendpoint POST "/"
  "Create a new `User`."
  [:as {{:keys [first_name last_name email password]} :body :as request}]
  {first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]}
  (check-superuser)
  (let [existing-user (sel :one [User :id :is_active] :email email)]
    (-> (cond
          ;; new user account, so create it
          (nil? existing-user) (create-user first_name last_name email :password password :send-welcome true :invitor @*current-user*)
          ;; this user already exists but is inactive, so simply reactivate the account
          (not (:is_active existing-user)) (do
                                             (upd User (:id existing-user)
                                               :first_name first_name
                                               :last_name last_name
                                               :is_active true
                                               :is_superuser false)
                                             (User (:id existing-user)))
          ;; account already exists and is active, so do nothing and just return the account
          :else (User (:id existing-user)))
        (hydrate :user :organization))))


(defendpoint GET "/current"
  "Fetch the current `User`."
  []
  (check-404 @*current-user*))


(defendpoint GET "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser."
  [id]
  (check-self-or-superuser id)
  (check-404 (sel :one User :id id, :is_active true)))


(defendpoint PUT "/:id"
  "Update a `User`."
  [id :as {{:keys [email first_name last_name is_superuser] :as body} :body}]
  {email      [Required Email]
   first_name NonEmptyString
   last_name  NonEmptyString}
  (check-self-or-superuser id)
  (check-404 (exists? User :id id :is_active true))           ; only allow updates if the specified account is active
  (check-400 (not (exists? User :email email :id [not= id]))) ; can't change email if it's already taken BY ANOTHER ACCOUNT
  (check-500 (upd-non-nil-keys User id
                               :email email
                               :first_name first_name
                               :last_name last_name
                               :is_superuser (if (:is_superuser @*current-user*)
                                               is_superuser
                                               nil)))
  (User id))


(defendpoint PUT "/:id/password"
  "Update a user's password."
  [id :as {{:keys [password old_password]} :body}]
  {password     [Required ComplexPassword]}
  (check-self-or-superuser id)
  (let-404 [user (sel :one [User :password_salt :password] :id id :is_active true)]
    (when (= id (:id @*current-user*))
      (checkp (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user)) "old_password" "Invalid password")))
  (set-user-password id password)
  (User id))


(defendpoint POST "/:id/send_invite"
  "Resend the user invite email for a given user."
  [id]
  (when-let [user (sel :one User :id id :is_active true)]
    (let [reset-token (set-user-password-reset-token id)
          ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
          join-url    (str (form-password-reset-url reset-token) "#new")]
      (email/send-new-user-email user @*current-user* join-url))))


(defendpoint DELETE "/:id"
  "Disable a `User`.  This does not remove the `User` from the db and instead disables their account."
  [id]
  (check-superuser)
  (check-500 (upd User id
                  :is_active false))
  {:success true})


(define-routes)
