(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :refer :all]
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [random-name expect-eval-actual-first]]))

;; ## POST /api/session
;; Test that we can login
(expect-eval-actual-first
    (sel :one :fields [Session :id] :user_id (user->id :rasta))
  (do (del Session :user_id (user->id :rasta))                  ; delete all other sessions for the bird first
      (client :post 200 "session" (user->credentials :rasta))))

;; Test for required params
(expect {:errors {:email "field is a required param."}}
  (client :post 400 "session" {}))

(expect {:errors {:password "field is a required param."}}
  (client :post 400 "session" {:email "anything@metabase.com"}))

;; Test for inactive user (user shouldn't be able to login if :is_active = false)
(expect {:errors {:email "no account found for the given email"}}
  (client :post 400 "session" (user->credentials :trashbird)))

;; Test for password checking
(expect {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (-> (user->credentials :rasta)
                                  (assoc :password "something else"))))


;; ## DELETE /api/session
;; Test that we can logout
(expect-eval-actual-first nil
  (let [{session_id :id} ((user->client :rasta) :post 200 "session" (user->credentials :rasta))]
    (assert session_id)
    ((user->client :rasta) :delete 204 "session" :session_id session_id)
    (sel :one Session :id session_id)))


;; ## POST /api/session/forgot_password
;; Test that we can initiate password reset
(expect
    true
  (let [reset-fields-set? (fn []
                            (let [{:keys [reset_token reset_triggered]} (sel :one :fields [User :reset_token :reset_triggered] :id (user->id :rasta))]
                              (boolean (and reset_token reset_triggered))))]
    ;; make sure user is starting with no values
    (upd User (user->id :rasta) :reset_token nil :reset_triggered nil)
    (assert (not (reset-fields-set?)))
    ;; issue reset request (token & timestamp should be saved)
    ((user->client :rasta) :post 200 "session/forgot_password" {:email (:email (user->credentials :rasta))})
    ;; TODO - how can we test email sent here?
    (reset-fields-set?)))

;; Test that email is required
(expect {:errors {:email "field is a required param."}}
  (client :post 400 "session/forgot_password" {}))

;; Test that email not found gives 404
(expect {:errors {:email "no account found for the given email"}}
  (client :post 400 "session/forgot_password" {:email "not-found@metabase.com"}))


;; POST /api/session/reset_password
;; Test that we can reset password from token (AND after token is used it gets removed)
(expect
  {:reset_token nil
   :reset_triggered nil}
  (let [user-last-name (random-name)
        token (.toString (java.util.UUID/randomUUID))
        password {:old "password"
                  :new "whateverUP12!!"}
        {:keys [email id] :as user} (create-user :password (:old password) :last_name user-last-name :reset_token token :reset_triggered (System/currentTimeMillis))
        creds {:old {:password (:old password)
                     :email    email}
               :new {:password (:new password)
                     :email    email}}]
    ;; Check that creds work
    (metabase.http-client/client :post 200 "session" (:old creds))
    ;; Change the PW
    (metabase.http-client/client :post 200 "session/reset_password" {:token    token
                                                                     :password (:new password)})
    ;; Old creds should no longer work
    (assert (= (metabase.http-client/client :post 400 "session" (:old creds))
              {:errors {:password "did not match stored password"}}))
    ;; New creds *should* work
    (metabase.http-client/client :post 200 "session" (:new creds))
    ;; Double check that reset token was cleared
    (sel :one :fields [User :reset_token :reset_triggered] :id id)))

;; Test that token and password are required
(expect {:errors {:token "field is a required param."}}
  (client :post 400 "session/reset_password" {}))

(expect {:errors {:password "field is a required param."}}
  (client :post 400 "session/reset_password" {:token "anything"}))

;; Test that invalid token returns 400
(expect {:errors {:token "Invalid reset token"}}
  (client :post 400 "session/reset_password" {:token "not-found"
                                              :password "whateverUP12!!"}))

;; Test that old token can expire
(expect {:errors {:token "Reset token has expired"}}
  (let [token (.toString (java.util.UUID/randomUUID))]
    (upd User (user->id :rasta) :reset_token token :reset_triggered 0)
    (client :post 400 "session/reset_password" {:token token
                                                :password "whateverUP12!!"})))


;; GET /session/properties
;; Check that a non-superuser can't read settings
(expect
  [{:value nil
    :key "site-name"
    :description "The name used for this instance of Metabase."
    :default "Metabase"}]
  ((user->client :rasta) :get 200 "session/properties"))
