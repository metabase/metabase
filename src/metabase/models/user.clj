(ns metabase.models.user
  (:require [clojure.string :as s]
            [cemerick.friend.credentials :as creds]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.email.messages :as email]
            (metabase.models [interface :as i]
                             [setting :as setting])
            [metabase.util :as u]))

;; ## Enity + DB Multimethods

(i/defentity User :core_user)

(defn- pre-insert [{:keys [email password reset_token] :as user}]
  (assert (u/is-email? email))
  (assert (and (string? password)
               (not (s/blank? password))))
  (assert (not (:password_salt user))
    "Don't try to pass an encrypted password to (ins User). Password encryption is handled by pre-insert.")
  (let [salt     (.toString (java.util.UUID/randomUUID))
        defaults {:date_joined  (u/new-sql-timestamp)
                  :last_login   nil
                  :is_staff     true
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
  (db/cascade-delete 'Session :user_id id)
  (db/cascade-delete 'Dashboard :creator_id id)
  (db/cascade-delete 'Card :creator_id id)
  (db/cascade-delete 'Pulse :creator_id id)
  (db/cascade-delete 'Activity :user_id id)
  (db/cascade-delete 'ViewLog :user_id id)
  (db/cascade-delete 'Segment :creator_id id)
  (db/cascade-delete 'Metric :creator_id id))

(extend (class User)
  i/IEntity
  (merge i/IEntityDefaults
         {:default-fields     (constantly [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb])
          :hydration-keys     (constantly [:author :creator :user])
          :pre-insert         pre-insert
          :pre-update         pre-update
          :post-select        post-select
          :pre-cascade-delete pre-cascade-delete}))


;; ## Related Functions

(declare create-user
         form-password-reset-url
         set-user-password
         set-user-password-reset-token)

(defn create-user
  "Convenience function for creating a new `User` and sending out the welcome email."
  [first-name last-name email-address & {:keys [send-welcome invitor password]
                                         :or {send-welcome false}}]
  {:pre [(string? first-name)
         (string? last-name)
         (string? email-address)]}
  (when-let [new-user (db/ins User
                        :email email-address
                        :first_name first-name
                        :last_name last-name
                        :password (if (not (nil? password))
                                    password
                                    (str (java.util.UUID/randomUUID))))]
    (when send-welcome
      (let [reset-token (set-user-password-reset-token (:id new-user))
            ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
            join-url    (str (form-password-reset-url reset-token) "#new")]
        (email/send-new-user-email new-user invitor join-url)))
    ;; return the newly created user
    new-user))

(defn set-user-password
  "Updates the stored password for a specified `User` by hashing the password with a random salt."
  [user-id password]
  (let [salt (.toString (java.util.UUID/randomUUID))
        password (creds/hash-bcrypt (str salt password))]
    ;; NOTE: any password change expires the password reset token
    (db/upd User user-id
      :password_salt salt
      :password password
      :reset_token nil
      :reset_triggered nil)))

(defn set-user-password-reset-token
  "Updates a given `User` and generates a password reset token for them to use.  Returns the url for password reset."
  [user-id]
  {:pre [(integer? user-id)]}
  (let [reset-token (str user-id \_ (java.util.UUID/randomUUID))]
    (db/upd User user-id, :reset_token reset-token, :reset_triggered (System/currentTimeMillis))
    ;; return the token
    reset-token))

(defn form-password-reset-url
  "Generate a properly formed password reset url given a password reset token."
  [reset-token]
  {:pre [(string? reset-token)]}
  (str (setting/get :-site-url) "/auth/reset_password/" reset-token))
