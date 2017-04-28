(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api
             [common :as api]
             [session :as session-api]]
            [metabase.email.messages :as email]
            [metabase.models.user :as user :refer [User]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- check-self-or-superuser
  "Check that USER-ID is *current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check-403 (or (= user-id api/*current-user-id*)
                     (:is_superuser @api/*current-user*))))

(api/defendpoint GET "/"
  "Fetch a list of all active `Users` for the admin People page."
  []
  (db/select [User :id :first_name :last_name :email :is_superuser :google_auth :last_login], :is_active true))

(defn- reactivate-user! [existing-user first-name last-name]
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


(api/defendpoint POST "/"
  "Create a new `User`, or or reäctivate an existing one."
  [:as {{:keys [first_name last_name email password]} :body}]
  {first_name su/NonBlankString
   last_name  su/NonBlankString
   email      su/Email}
  (api/check-superuser)
  (if-let [existing-user (db/select-one [User :id :is_active :google_auth], :email email)]
    ;; this user already exists but is inactive, so simply reactivate the account
    (reactivate-user! existing-user first_name last_name)
    ;; new user account, so create it
    (user/invite-user! first_name last_name email password @api/*current-user*)))


(api/defendpoint GET "/current"
  "Fetch the current `User`."
  []
  (api/check-404 @api/*current-user*))


(api/defendpoint GET "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser."
  [id]
  (check-self-or-superuser id)
  (api/check-404 (User :id id, :is_active true)))


(api/defendpoint PUT "/:id"
  "Update a `User`."
  [id :as {{:keys [email first_name last_name is_superuser]} :body}]
  {email      su/Email
   first_name (s/maybe su/NonBlankString)
   last_name  (s/maybe su/NonBlankString)}
  (check-self-or-superuser id)
  (api/check-404 (db/exists? User, :id id, :is_active true)) ; only allow updates if the specified account is active
  (api/check-400 (not (db/exists? User, :email email, :id [:not= id]))) ; can't change email if it's already taken BY ANOTHER ACCOUNT
  (api/check-500 (db/update-non-nil-keys! User id
                   :email        email
                   :first_name   first_name
                   :last_name    last_name
                   :is_superuser (when (:is_superuser @api/*current-user*)
                                   is_superuser)))
  (User id))


(api/defendpoint PUT "/:id/password"
  "Update a user's password."
  [id :as {{:keys [password old_password]} :body}]
  {password su/ComplexPassword}
  (check-self-or-superuser id)
  (api/let-404 [user (db/select-one [User :password_salt :password], :id id, :is_active true)]
    ;; admins are allowed to reset anyone's password (in the admin people list) so no need to check the value of `old_password` for them
    ;; regular users have to know their password, however
    (when-not (:is_superuser @api/*current-user*)
      (api/checkp (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user)) "old_password" "Invalid password")))
  (user/set-password! id password)
  ;; return the updated User
  (User id))


;; TODO - This could be handled by PUT /api/user/:id, we don't need a separate endpoint
(api/defendpoint PUT "/:id/qbnewb"
  "Indicate that a user has been informed about the vast intricacies of 'the' Query Builder."
  [id]
  (check-self-or-superuser id)
  (api/check-500 (db/update! User id, :is_qbnewb false))
  {:success true})


(api/defendpoint POST "/:id/send_invite"
  "Resend the user invite email for a given user."
  [id]
  (api/check-superuser)
  (when-let [user (User :id id, :is_active true)]
    (let [reset-token (user/set-password-reset-token! id)
          ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
          join-url    (str (user/form-password-reset-url reset-token) "#new")]
      (email/send-new-user-email! user @api/*current-user* join-url))))


(api/defendpoint DELETE "/:id"
  "Disable a `User`.  This does not remove the `User` from the DB, but instead disables their account."
  [id]
  (api/check-superuser)
  (api/check-500 (db/update! User id, :is_active false))
  {:success true})


(api/define-routes)
