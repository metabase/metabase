(ns metabase.api.session
  "/api/session endpoints"
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [defroutes GET POST DELETE]]
            [hiccup.core :refer [html]]
            [korma.core :as korma]
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
  (let [user (sel :one :fields [User :id :password_salt :password] :email email (korma/where {:is_active true}))]
    (checkp (not (nil? user))
    ; Don't leak whether the account doesn't exist or the password was incorrect
      (symbol "password") "did not match stored password")
    (checkp (pass/verify-password password (:password_salt user) (:password user))
      (symbol "password") "did not match stored password")
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


(defendpoint POST "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [:as {:keys [server-name] {:keys [email]} :body, {:strs [origin]} :headers}]
  ;; Use the `origin` header, which looks like `http://localhost:3000`, as the base of the reset password URL.
  ;; (Currently, there's no other way to get this info)
  ;;
  ;; This is a bit sketchy. Someone malicious could send a bad origin header and hit this endpoint to send
  ;; a forgotten password email to another User, and take them to some sort of phishing site. Although not sure
  ;; what you could phish from them since they already forgot their password.
  {email [Required Email]}
  (let [{user-id :id} (sel :one User :email email)
        reset-token (java.util.UUID/randomUUID)
        password-reset-url (str origin "/auth/reset_password/" reset-token)]
    ; Don't leak whether the account doesn't exist, just pretend everything is ok
    (if (not (nil? user-id))
      (do
        (upd User user-id :reset_token reset-token :reset_triggered (System/currentTimeMillis))
        (email/send-password-reset-email email server-name password-reset-url)
        (log/info password-reset-url)))))


(defendpoint POST "/reset_password"
  "Reset password with a reset token."
  [:as {{:keys [token password] :as body} :body}]
  {token    Required
   password [Required ComplexPassword]}
  (let [user (sel :one :fields [User :id :reset_triggered] :reset_token token)]
    (checkp (not (nil? user))
      (symbol "token") "Invalid reset token")
    ;; check that the reset was triggered within the last 1 HOUR, after that the token is considered expired
    (checkp (> (* 60 60 1000) (- (System/currentTimeMillis) (get user :reset_triggered 0)))
      (symbol "token") "Reset token has expired")
    (set-user-password (:id user) password)
    {:success true}))


(defendpoint GET "/properties"
  "Get all global properties and their values. These are the specific `Settings` which are meant to be public."
  []
  (filter #(= (:key %) :site-name) (setting/all-with-descriptions)))


(define-routes)
