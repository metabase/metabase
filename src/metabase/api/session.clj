(ns metabase.api.session
  "/api/session endpoints"
  (:require [cemerick.friend.credentials :as creds]
            [clojure.tools.logging :as log]
            [compojure.core :refer [defroutes POST DELETE]]
            [hiccup.core :refer [html]]
            [korma.core :as korma]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.email :as email]
            (metabase.models [user :refer [User set-user-password]]
                             [session :refer [Session]])
            [metabase.util.password :as password]))


;; login
(defendpoint POST "/" [:as {{:keys [email password] :as body} :body}]
  {email    [Required Email]
   password [Required NonEmptyString]}
  (let-400 [user (sel :one :fields [User :id :password_salt :password] :email email (korma/where {:is_active true}))]
    (check (creds/bcrypt-verify (str (:password_salt user) password) (:password user))
      [400 "password mismatch"])
    (let [session-id (str (java.util.UUID/randomUUID))]
      (ins Session
        :id session-id
        :user_id (:id user))
      {:id session-id})))


;; logout
(defendpoint DELETE "/" [session_id]
  {session_id [Required NonEmptyString]}
  (check-exists? Session session_id)
  (del Session :id session_id))


;; forgotten password reset email
(defendpoint POST "/forgot_password" [:as {{:keys [email]} :body, {:strs [origin]} :headers}]
  ;; Use the `origin` header, which looks like `http://localhost:3000`, as the base of the reset password URL.
  ;; (Currently, there's no other way to get this info)
  ;;
  ;; This is a bit sketchy. Someone malicious could send a bad origin header and hit this endpoint to send
  ;; a forgotten password email to another User, and take them to some sort of phishing site. Although not sure
  ;; what you could phish from them since they already forgot their password.
  {email [Required Email]}
  (let [{user-id :id user-name :common_name} (sel :one User :email email)
        reset-token (java.util.UUID/randomUUID)
        password-reset-url (str origin "/auth/reset_password/" reset-token)]
    (check-404 user-id)
    (upd User user-id :reset_token reset-token :reset_triggered (System/currentTimeMillis))
    (email/send-message "Metabase Password Reset" {email user-name}
                        :html (html [:p "Hey, " user-name ", sorry you forgot your password :'(."]
                                    [:p [:a {:href password-reset-url} "Click here to reset it!"]]
                                    [:p "<3"]))
    (log/info password-reset-url)))


;; set password from reset token
(defendpoint POST "/reset_password" [:as {{:keys [token password] :as body} :body}]
  {token    Required
   password [Required ComplexPassword]}
  (let-404 [user (sel :one :fields [User :id :reset_triggered] :reset_token token)]
    ;; check that the reset was triggered within the last 1 HOUR, after that the token is considered expired
    (check-404 (> (* 60 60 1000) (- (System/currentTimeMillis) (get user :reset_triggered 0))))
    (set-user-password (:id user) password)
    {:success true}))

(define-routes)
