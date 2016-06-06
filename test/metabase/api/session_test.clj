(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [cemerick.friend.credentials :as creds]
            [expectations :refer :all]
            [metabase.db :as db]
            [metabase.http-client :refer :all]
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [metabase.test.util :refer [random-name expect-eval-actual-first]]))

;; ## POST /api/session
;; Test that we can login
(expect-eval-actual-first
  (db/select-one [Session :id], :user_id (user->id :rasta))
  (do (db/delete! Session, :user_id (user->id :rasta))             ; delete all other sessions for the bird first
      (client :post 200 "session" (user->credentials :rasta))))

;; Test for required params
(expect {:errors {:email "field is a required param."}}
  (client :post 400 "session" {}))

(expect {:errors {:password "field is a required param."}}
  (client :post 400 "session" {:email "anything@metabase.com"}))

;; Test for inactive user (user shouldn't be able to login if :is_active = false)
;; Return same error as incorrect password to avoid leaking existence of user
(expect {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (user->credentials :trashbird)))

;; Test for password checking
(expect {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (-> (user->credentials :rasta)
                                  (assoc :password "something else"))))

;; Test that people get blocked from attempting to login if they try too many times
;; (Check that throttling works at the API level -- more tests in metabase.api.common.throttle-test)
(expect
    [{:errors {:email "Too many attempts! You must wait 15 seconds before trying again."}}
     {:errors {:email "Too many attempts! You must wait 15 seconds before trying again."}}]
  (let [login #(client :post 400 "session" {:email "fakeaccount3000@metabase.com", :password "toucans"})]
    ;; attempt to log in 10 times
    (dorun (repeatedly 10 login))
    ;; throttling should now be triggered
    [(login)
     ;; Trying to login immediately again should still return throttling error
     (login)]))


;; ## DELETE /api/session
;; Test that we can logout
(expect-eval-actual-first nil
  (let [{session_id :id} ((user->client :rasta) :post 200 "session" (user->credentials :rasta))]
    (assert session_id)
    ((user->client :rasta) :delete 204 "session" :session_id session_id)
    (Session session_id)))


;; ## POST /api/session/forgot_password
;; Test that we can initiate password reset
(expect
    true
  (let [reset-fields-set? (fn []
                            (let [{:keys [reset_token reset_triggered]} (db/select-one [User :reset_token :reset_triggered], :id (user->id :rasta))]
                              (boolean (and reset_token reset_triggered))))]
    ;; make sure user is starting with no values
    (db/update! User (user->id :rasta), :reset_token nil, :reset_triggered nil)
    (assert (not (reset-fields-set?)))
    ;; issue reset request (token & timestamp should be saved)
    ((user->client :rasta) :post 200 "session/forgot_password" {:email (:email (user->credentials :rasta))})
    ;; TODO - how can we test email sent here?
    (reset-fields-set?)))

;; Test that email is required
(expect {:errors {:email "field is a required param."}}
  (client :post 400 "session/forgot_password" {}))

;; Test that email not found also gives 200 as to not leak existence of user
(expect nil
  (client :post 200 "session/forgot_password" {:email "not-found@metabase.com"}))


;; POST /api/session/reset_password
;; Test that we can reset password from token (AND after token is used it gets removed)
(expect
  {:reset_token nil
   :reset_triggered nil}
  (let [user-last-name     (random-name)
        password           {:old "password"
                            :new "whateverUP12!!"}
        {:keys [email id]} (create-user :password (:old password), :last_name user-last-name, :reset_triggered (System/currentTimeMillis))
        token              (u/prog1 (str id "_" (java.util.UUID/randomUUID))
                             (db/update! User id, :reset_token <>))
        creds              {:old {:password (:old password)
                                  :email    email}
                            :new {:password (:new password)
                                  :email    email}}]
    ;; Check that creds work
    (client :post 200 "session" (:old creds))

    ;; Call reset password endpoint to change the PW
    (client :post 200 "session/reset_password" {:token    token
                                                :password (:new password)})
    ;; Old creds should no longer work
    (assert (= (client :post 400 "session" (:old creds))
              {:errors {:password "did not match stored password"}}))
    ;; New creds *should* work
    (client :post 200 "session" (:new creds))
    ;; Double check that reset token was cleared
    (db/select-one [User :reset_token :reset_triggered], :id id)))

;; Check that password reset returns a valid session token
(let [user-last-name (random-name)]
  (expect-eval-actual-first
    (let [id         (db/select-one-id User, :last_name user-last-name)
          session-id (db/select-one-id Session, :user_id id)]
      {:success    true
       :session_id session-id})
    (let [{:keys [email id]} (create-user :password "password", :last_name user-last-name, :reset_triggered (System/currentTimeMillis))
          token              (u/prog1 (str id "_" (java.util.UUID/randomUUID))
                               (db/update! User id, :reset_token <>))]
      ;; run the password reset
      (client :post 200 "session/reset_password" {:token    token
                                                  :password "whateverUP12!!"}))))

;; Test that token and password are required
(expect {:errors {:token "field is a required param."}}
  (client :post 400 "session/reset_password" {}))

(expect {:errors {:password "field is a required param."}}
  (client :post 400 "session/reset_password" {:token "anything"}))

;; Test that malformed token returns 400
(expect {:errors {:password "Invalid reset token"}}
  (client :post 400 "session/reset_password" {:token "not-found"
                                              :password "whateverUP12!!"}))

;; Test that invalid token returns 400
(expect {:errors {:password "Invalid reset token"}}
  (client :post 400 "session/reset_password" {:token "1_not-found"
                                              :password "whateverUP12!!"}))

;; Test that an expired token doesn't work
(expect {:errors {:password "Invalid reset token"}}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered 0)
    (client :post 400 "session/reset_password" {:token token
                                                :password "whateverUP12!!"})))


;;; GET /session/password_reset_token_valid

;; Check that a valid, unexpired token returns true
(expect {:valid true}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered (dec (System/currentTimeMillis)))
    (client :get 200 "session/password_reset_token_valid", :token token)))

;; Check than an made-up token returns false
(expect {:valid false}
  (client :get 200 "session/password_reset_token_valid", :token "ABCDEFG"))

;; Check that an expired but valid token returns false
(expect {:valid false}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered 0)
    (client :get 200 "session/password_reset_token_valid", :token token)))


;; GET /session/properties
(expect
  (vec (keys (metabase.models.setting/public-settings)))
  (vec (keys ((user->client :rasta) :get 200 "session/properties"))))
