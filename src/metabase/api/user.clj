(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET DELETE POST PUT]]
            [metabase.api.common :refer :all]
            [metabase.api.session :as session-api]
            [metabase.db :as db]
            [metabase.email.messages :as email]
            [metabase.models.user :refer [User create-user! set-user-password! set-user-password-reset-token! form-password-reset-url]]
            [metabase.util :as u]))

(defn- check-self-or-superuser
  "Check that USER-ID is `*current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (check-403 (or (= user-id *current-user-id*)
                 (:is_superuser @*current-user*))))

(defendpoint GET "/"
  "Fetch a list of all active `Users` for the admin People page."
  []
  (db/select [User :id :first_name :last_name :email :is_superuser :google_auth :last_login], :is_active true))

(defn- reäctivate-user! [existing-user first-name last-name]
  (when-not (:is_active existing-user)
    (db/update! User (u/get-id existing-user)
      :first_name    first-name
      :last_name     last-name
      :is_active     true
      :is_superuser  false
      ;; if the user orignally logged in via Google Auth and it's no longer enabled, convert them into a regular user (see Issue #3323)
      :google_auth   (boolean (and (:google_auth existing-user)
                                   (session-api/google-auth-client-id))))) ; if google-auth-client-id is set it means Google Auth is enabled
  ;; now return the existing user whether they were originally active or not
  (User (u/get-id existing-user)))


(defendpoint POST "/"
  "Create a new `User`, or or reäctivate an existing one."
  [:as {{:keys [first_name last_name email password]} :body}]
  {first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]}
  (check-superuser)
  (if-let [existing-user (db/select-one [User :id :is_active :google_auth], :email email)]
    ;; this user already exists but is inactive, so simply reactivate the account
    (reäctivate-user! existing-user first_name last_name)
    ;; new user account, so create it
    (create-user! first_name last_name email, :password password, :send-welcome true, :invitor @*current-user*)))


(defendpoint GET "/current"
  "Fetch the current `User`."
  []
  (check-404 @*current-user*))


(defendpoint GET "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser."
  [id]
  (check-self-or-superuser id)
  (check-404 (User :id id, :is_active true)))


(defendpoint PUT "/:id"
  "Update a `User`."
  [id :as {{:keys [email first_name last_name is_superuser]} :body}]
  {email      [Required Email]
   first_name NonEmptyString
   last_name  NonEmptyString}
  (check-self-or-superuser id)
  (check-404 (db/exists? User, :id id, :is_active true))            ; only allow updates if the specified account is active
  (check-400 (not (db/exists? User, :email email, :id [:not= id]))) ; can't change email if it's already taken BY ANOTHER ACCOUNT
  (check-500 (db/update-non-nil-keys! User id
               :email        email
               :first_name   first_name
               :last_name    last_name
               :is_superuser (when (:is_superuser @*current-user*)
                               is_superuser)))
  (User id))


(defendpoint PUT "/:id/password"
  "Update a user's password."
  [id :as {{:keys [password old_password]} :body}]
  {password     [Required ComplexPassword]}
  (check-self-or-superuser id)
  (let-404 [user (db/select-one [User :password_salt :password], :id id, :is_active true)]
    (when (and (not (:is_superuser @*current-user*))
               (= id *current-user-id*))
      (checkp (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user)) "old_password" "Invalid password")))
  (set-user-password! id password)
  (User id))


(defendpoint PUT "/:id/qbnewb"
  "Indicate that a user has been informed about the vast intricacies of 'the' QueryBuilder."
  [id]
  (check-self-or-superuser id)
  (check-500 (db/update! User id, :is_qbnewb false))
  {:success true})


(defendpoint POST "/:id/send_invite"
  "Resend the user invite email for a given user."
  [id]
  (check-superuser)
  (when-let [user (User :id id, :is_active true)]
    (let [reset-token (set-user-password-reset-token! id)
          ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
          join-url    (str (form-password-reset-url reset-token) "#new")]
      (email/send-new-user-email user @*current-user* join-url))))


(defendpoint DELETE "/:id"
  "Disable a `User`.  This does not remove the `User` from the db and instead disables their account."
  [id]
  (check-superuser)
  (check-500 (db/update! User id
               :is_active false))
  {:success true})


(define-routes)
