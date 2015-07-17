(ns metabase.api.session
  "/api/session endpoints"
  (:require [clojure.tools.logging :as log]
            [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET POST DELETE]]
            [hiccup.core :refer [html]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.email.messages :as email]
            (metabase.models [user :refer [User set-user-password]]
                             [session :refer [Session]]
                             [setting :as setting])
            [metabase.util.password :as pass]))


(defendpoint POST "/"
  "Login."
  [:as {{:keys [email password] :as body} :body}]
  {email    [Required Email]
   password [Required NonEmptyString]}
  (let [user (sel :one :fields [User :id :password_salt :password] :email email (k/where {:is_active true}))]
    (checkp (not (nil? user))
    ; Don't leak whether the account doesn't exist or the password was incorrect
      'password "did not match stored password")
    (checkp (pass/verify-password password (:password_salt user) (:password user))
      'password "did not match stored password")
    (let [session-id (str (java.util.UUID/randomUUID))]
      (ins Session
        :id session-id
        :user_id (:id user))
      {:id session-id})))


(defendpoint DELETE "/"
  "Logout."
  [session_id]
  {session_id [Required NonEmptyString]}
  (check-exists? Session session_id)
  (del Session :id session_id))

;; Reset tokens:
;; We need some way to match a plaintext token with the a user since the token stored in the DB is hashed.
;; So we'll make the plaintext token in the format USER-ID_RANDOM-UUID, e.g. "100_8a266560-e3a8-4dc1-9cd1-b4471dcd56d7", before hashing it.
;; "Leaking" the ID this way is ok because the plaintext token is only sent in the password reset email to the user in question.
;;
;; There's also no need to salt the token because it's already random <3

(defendpoint POST "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [:as {:keys [server-name] {:keys [email]} :body, :as request}]
  {email [Required Email]}
  (let [user-id            (sel :one :id User :email email)
        reset-token        (str user-id "_" (java.util.UUID/randomUUID))
        password-reset-url (str (@(ns-resolve 'metabase.core 'site-url) request) "/auth/reset_password/" reset-token)] ; avoid circular deps
    ;; Don't leak whether the account doesn't exist, just pretend everything is ok
    (when user-id
      (upd User user-id, :reset_token reset-token, :reset_triggered (System/currentTimeMillis))
      (email/send-password-reset-email email server-name password-reset-url)
      (log/info password-reset-url))))


(defendpoint POST "/reset_password"
  "Reset password with a reset token."
  [:as {{:keys [token password] :as body} :body}]
  {token    Required
   password [Required ComplexPassword]}
  (api-let [400 "Invalid reset token"] [[_ user-id]                           (re-matches #"(^\d+)_.+$" token)
                                        user-id                               (Integer/parseInt user-id)
                                        {:keys [reset_token reset_triggered]} (sel :one :fields [User :reset_triggered :reset_token] :id user-id)]
    ;; Make sure the plaintext token matches up with the hashed one for this user
    (check (creds/bcrypt-verify token reset_token)
      [400 "Invalid reset token"]

      ;; check that the reset was triggered within the last 1 HOUR, after that the token is considered expired
      (> (* 60 60 1000) (- (System/currentTimeMillis) (or reset_triggered 0)))
      [400 "Reset token has expired"])
    (set-user-password user-id password)
    {:success true}))


(defendpoint GET "/properties"
  "Get all global properties and their values. These are the specific `Settings` which are meant to be public."
  []
  (filter #(= (:key %) :site-name) (setting/all-with-descriptions)))


(define-routes)
