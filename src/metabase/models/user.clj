(ns metabase.models.user
  (:require [clojure.string :as s]
            [cemerick.friend.credentials :as creds]
            [metabase.db :as db]
            [metabase.email.messages :as email]
            (metabase.models [interface :as i]
                             [setting :as setting])
            [metabase.util :as u]))

;; ## Enity + DB Multimethods

(i/defentity User :core_user)

(defn- pre-insert [{:keys [email password reset_token] :as user}]
  (assert (u/is-email? email)
    (format "Not a valid email: '%s'" email))
  (assert (and (string? password)
               (not (s/blank? password))))
  (assert (not (:password_salt user))
    "Don't try to pass an encrypted password to (ins User). Password encryption is handled by pre-insert.")
  (let [salt     (str (java.util.UUID/randomUUID))
        defaults {:date_joined  (u/new-sql-timestamp)
                  :last_login   nil
                  :is_active    true
                  :is_superuser false}]
    ;; always salt + encrypt the password before putting new User in the DB
    ;; TODO - we should do password encryption in pre-update too instead of in the session code
    (merge defaults user
           {:password_salt salt
            :password      (creds/hash-bcrypt (str salt password))}
           (when reset_token
             {:reset_token (creds/hash-bcrypt reset_token)}))))

(defn- pre-update [{:keys [email reset_token] :as user}]
  (when email
    (assert (u/is-email? email)))
  (cond-> user
    reset_token (assoc :reset_token (creds/hash-bcrypt reset_token))))

(defn- post-select [{:keys [first_name last_name], :as user}]
  (cond-> user
    (or first_name last_name) (assoc :common_name (str first_name " " last_name))))

(defn- pre-cascade-delete [{:keys [id]}]
  (doseq [[model k] [['Session        :user_id]
                     ['Dashboard      :creator_id]
                     ['Card           :creator_id]
                     ['Pulse          :creator_id]
                     ['Activity       :user_id]
                     ['ViewLog        :user_id]
                     ['Segment        :creator_id]
                     ['Metric         :creator_id]
                     ['Revision       :user_id]
                     ['QueryExecution :executor_id]]]
    (db/cascade-delete! model k id)))

(u/strict-extend (class User)
  i/IEntity
  (merge i/IEntityDefaults
         {:default-fields     (constantly [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])
          :hydration-keys     (constantly [:author :creator :user])
          :pre-insert         pre-insert
          :pre-update         pre-update
          :post-select        post-select
          :pre-cascade-delete pre-cascade-delete}))


;; ## Related Functions

(declare form-password-reset-url
         set-user-password-reset-token!)

;; TODO - `:send-welcome?` instead of `:send-welcome`
(defn create-user!
  "Convenience function for creating a new `User` and sending out the welcome email."
  [first-name last-name email-address & {:keys [send-welcome invitor password google-auth?]
                                         :or   {send-welcome false
                                                google-auth?  false}}]
  {:pre [(string? first-name) (string? last-name) (string? email-address)]}
  (u/prog1 (db/insert! User
             :email       email-address
             :first_name  first-name
             :last_name   last-name
             :password    (if-not (nil? password)
                            password
                            (str (java.util.UUID/randomUUID)))
             :google_auth google-auth?)
    (when send-welcome
      (let [reset-token (set-user-password-reset-token! (:id <>))
            ;; the new user join url is just a password reset with an indicator that this is a first time user
            join-url    (str (form-password-reset-url reset-token) "#new")]
        (email/send-new-user-email <> invitor join-url)))
    ;; notifiy the admin of this MB instance that a new user has joined (TODO - are there cases where we *don't* want to do this)
    (email/send-user-joined-admin-notification-email <> invitor google-auth?)))

(defn set-user-password!
  "Updates the stored password for a specified `User` by hashing the password with a random salt."
  [user-id password]
  (let [salt     (str (java.util.UUID/randomUUID))
        password (creds/hash-bcrypt (str salt password))]
    ;; NOTE: any password change expires the password reset token
    (db/update! User user-id
      :password_salt   salt
      :password        password
      :reset_token     nil
      :reset_triggered nil)))

(defn set-user-password-reset-token!
  "Updates a given `User` and generates a password reset token for them to use. Returns the URL for password reset."
  [user-id]
  {:pre [(integer? user-id)]}
  (u/prog1 (str user-id \_ (java.util.UUID/randomUUID))
    (db/update! User user-id
      :reset_token     <>
      :reset_triggered (System/currentTimeMillis))))

(defn form-password-reset-url
  "Generate a properly formed password reset url given a password reset token."
  [reset-token]
  {:pre [(string? reset-token)]}
  (str (setting/get :-site-url) "/auth/reset_password/" reset-token))

(defn instance-created-at
  "The date this Metabase instance was created.  We use the `:date_joined` of the first `User` to determine this."
  ^java.sql.Timestamp []
  (db/select-one-field :date_joined User, {:order-by [[:date_joined :asc]]}))
