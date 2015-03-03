(ns metabase.api.session
  "/api/session endpoints"
  (:require [cemerick.friend.credentials :as creds]
            [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes POST DELETE]]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User set-user-password]]
                             [session :refer [Session]])))


;; login
(defendpoint POST "/" [:as {{:keys [email password] :as body} :body}]
  (require-params email password)
  (let-400 [user (sel :one [User :id :password_salt :password] :email email)]
    (check (creds/bcrypt-verify (str (:password_salt user) password) (:password user)) [400 "password mismatch"])
    (let [session-id (str (java.util.UUID/randomUUID))]
      (ins Session
        :id session-id
        :user_id (:id user))
      {:id session-id})))


;; logout
(defendpoint DELETE "/" [:as {{:keys [session_id]} :params}]
  (check-400 session_id)
  (check-400 (exists? Session :id session_id))
  (del Session :id session_id))


;; forgotten password reset email
(defendpoint POST "/forgot_password" [:as {{:keys [email] :as body} :body}]
  (require-params email)
  (let [user-id (sel :one :id User :email email)
        reset-token (java.util.UUID/randomUUID)]
    (check-404 user-id)
    (upd User user-id :reset_token reset-token :reset_triggered (System/currentTimeMillis))
    ;; TODO - send email
    (println (str "/auth/reset_password/" reset-token))))


;; set password from reset token
(defendpoint POST "/reset_password" [:as {{:keys [token password] :as body} :body}]
  (require-params token password)
  (let-404 [user (sel :one :fields [User :id :reset_triggered] :reset_token token)]
    ;; check that the reset was triggered within the last 1 HOUR, after that the token is considered expired
    (check-404 (> (* 60 60 1000) (- (System/currentTimeMillis) (get user :reset_triggered 0))))
    ;; TODO - check that password is of required strength
    (set-user-password (:id user) password)
    {:success true}))

(define-routes)
