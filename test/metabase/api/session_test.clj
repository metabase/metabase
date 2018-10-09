(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :refer :all]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.session :as session-api :refer :all]
            [metabase.models
             [session :refer [Session]]
             [user :refer [User]]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [metabase.test.integrations.ldap :refer [expect-with-ldap-server]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## POST /api/session
;; Test that we can login
(expect
  ;; delete all other sessions for the bird first, otherwise test doesn't seem to work (TODO - why?)
  (do (db/simple-delete! Session, :user_id (user->id :rasta))
      (tu/is-uuid-string? (:id (client :post 200 "session" (user->credentials :rasta))))))

;; Test for required params
(expect {:errors {:username "value must be a non-blank string."}}
  (client :post 400 "session" {}))

(expect {:errors {:password "value must be a non-blank string."}}
  (client :post 400 "session" {:username "anything@metabase.com"}))

;; Test for inactive user (user shouldn't be able to login if :is_active = false)
;; Return same error as incorrect password to avoid leaking existence of user
(expect {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (user->credentials :trashbird)))

;; Test for password checking
(expect {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (-> (user->credentials :rasta)
                                  (assoc :password "something else"))))

;; Test that people get blocked from attempting to login if they try too many times (Check that throttling works at
;; the API level -- more tests in the throttle library itself: https://github.com/metabase/throttle)
(expect
    [{:errors {:username "Too many attempts! You must wait 15 seconds before trying again."}}
     {:errors {:username "Too many attempts! You must wait 15 seconds before trying again."}}]
  (let [login #(client :post 400 "session" {:username "fakeaccount3000@metabase.com", :password "toucans"})]
    ;; attempt to log in 10 times
    (dorun (repeatedly 10 login))
    ;; throttling should now be triggered
    [(login)
     ;; Trying to login immediately again should still return throttling error
     (login)]))


;; ## DELETE /api/session
;; Test that we can logout
(expect
  nil
  (let [{session_id :id} ((user->client :rasta) :post 200 "session" (user->credentials :rasta))]
    (assert session_id)
    ((user->client :rasta) :delete 204 "session" :session_id session_id)
    (Session session_id)))


;; ## POST /api/session/forgot_password
;; Test that we can initiate password reset
(expect
  (et/with-fake-inbox
    (let [reset-fields-set? (fn []
                              (let [{:keys [reset_token reset_triggered]} (db/select-one [User :reset_token :reset_triggered], :id (user->id :rasta))]
                                (boolean (and reset_token reset_triggered))))]
      ;; make sure user is starting with no values
      (db/update! User (user->id :rasta), :reset_token nil, :reset_triggered nil)
      (assert (not (reset-fields-set?)))
      ;; issue reset request (token & timestamp should be saved)
      ((user->client :rasta) :post 200 "session/forgot_password" {:email (:username (user->credentials :rasta))})
      ;; TODO - how can we test email sent here?
      (reset-fields-set?))))

;; Test that email is required
(expect {:errors {:email "value must be a valid email address."}}
  (client :post 400 "session/forgot_password" {}))

;; Test that email not found also gives 200 as to not leak existence of user
(expect nil
  (client :post 200 "session/forgot_password" {:email "not-found@metabase.com"}))


;; POST /api/session/reset_password
;; Test that we can reset password from token (AND after token is used it gets removed)

(expect
  {:reset_token     nil
   :reset_triggered nil}
  (et/with-fake-inbox
    (let [password {:old "password"
                    :new "whateverUP12!!"}]
      (tt/with-temp User [{:keys [email id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
        (let [token (u/prog1 (str id "_" (java.util.UUID/randomUUID))
                      (db/update! User id, :reset_token <>))
              creds {:old {:password (:old password)
                           :username email}
                     :new {:password (:new password)
                           :username email}}]
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
          (db/select-one [User :reset_token :reset_triggered], :id id))))))

;; Check that password reset returns a valid session token
(expect
  {:success    true
   :session_id true}
  (et/with-fake-inbox
    (tt/with-temp User [{:keys [id]} {:reset_triggered (System/currentTimeMillis)}]
      (let [token (u/prog1 (str id "_" (java.util.UUID/randomUUID))
                    (db/update! User id, :reset_token <>))]
        (-> (client :post 200 "session/reset_password" {:token    token
                                                        :password "whateverUP12!!"})
            (update :session_id tu/is-uuid-string?))))))

;; Test that token and password are required
(expect {:errors {:token "value must be a non-blank string."}}
  (client :post 400 "session/reset_password" {}))

(expect {:errors {:password "Insufficient password strength"}}
  (client :post 400 "session/reset_password" {:token "anything"}))

;; Test that malformed token returns 400
(expect
  {:errors {:password "Invalid reset token"}}
  (client :post 400 "session/reset_password" {:token    "not-found"
                                              :password "whateverUP12!!"}))

;; Test that invalid token returns 400
(expect
  {:errors {:password "Invalid reset token"}}
  (client :post 400 "session/reset_password" {:token    "1_not-found"
                                              :password "whateverUP12!!"}))

;; Test that an expired token doesn't work
(expect
  {:errors {:password "Invalid reset token"}}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered 0)
    (client :post 400 "session/reset_password" {:token    token
                                                :password "whateverUP12!!"})))


;;; GET /session/password_reset_token_valid

;; Check that a valid, unexpired token returns true
(expect
  {:valid true}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered (dec (System/currentTimeMillis)))
    (client :get 200 "session/password_reset_token_valid", :token token)))

;; Check than an made-up token returns false
(expect
  {:valid false}
  (client :get 200 "session/password_reset_token_valid", :token "ABCDEFG"))

;; Check that an expired but valid token returns false
(expect
  {:valid false}
  (let [token (str (user->id :rasta) "_" (java.util.UUID/randomUUID))]
    (db/update! User (user->id :rasta), :reset_token token, :reset_triggered 0)
    (client :get 200 "session/password_reset_token_valid", :token token)))


;; GET /session/properties
(expect
  (keys (public-settings/public-settings))
  (keys ((user->client :rasta) :get 200 "session/properties")))


;;; ------------------------------------------ TESTS FOR GOOGLE AUTH STUFF -------------------------------------------

;;; tests for email->domain
(expect "metabase.com"   (#'session-api/email->domain "cam@metabase.com"))
(expect "metabase.co.uk" (#'session-api/email->domain "cam@metabase.co.uk"))
(expect "metabase.com"   (#'session-api/email->domain "cam.saul+1@metabase.com"))

;;; tests for email-in-domain?
(expect true  (#'session-api/email-in-domain? "cam@metabase.com"          "metabase.com"))
(expect false (#'session-api/email-in-domain? "cam.saul+1@metabase.co.uk" "metabase.com"))
(expect true  (#'session-api/email-in-domain? "cam.saul+1@metabase.com"   "metabase.com"))

;;; tests for autocreate-user-allowed-for-email?
(expect
  (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
    (#'session-api/autocreate-user-allowed-for-email? "cam@metabase.com")))

(expect
  false
  (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
    (#'session-api/autocreate-user-allowed-for-email? "cam@expa.com")))


;;; tests for google-auth-create-new-user!
;; shouldn't be allowed to create a new user via Google Auth if their email doesn't match the auto-create accounts domain
(expect
  clojure.lang.ExceptionInfo
  (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"]
    (#'session-api/google-auth-create-new-user! {:first_name "Rasta"
                                                 :last_name  "Toucan"
                                                 :email      "rasta@metabase.com"})))

;; should totally work if the email domains match up
(expect
  {:first_name "Rasta", :last_name "Toucan", :email "rasta@sf-toucannery.com"}
  (et/with-fake-inbox
    (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"
                                       admin-email                             "rasta@toucans.com"]
      (select-keys (u/prog1 (#'session-api/google-auth-create-new-user! {:first_name "Rasta"
                                                                         :last_name  "Toucan"
                                                                         :email      "rasta@sf-toucannery.com"})
                     (db/delete! User :id (:id <>))) ; make sure we clean up after ourselves !
                   [:first_name :last_name :email]))))


;;; tests for google-auth-fetch-or-create-user!

(defn- is-session? [session]
  (u/ignore-exceptions
    (tu/is-uuid-string? (:id session))))

;; test that an existing user can log in with Google auth even if the auto-create accounts domain is different from
;; their account should return a Session
(expect
  (tt/with-temp User [user {:email "cam@sf-toucannery.com"}]
    (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com"]
      (is-session? (#'session-api/google-auth-fetch-or-create-user! "Cam" "Saül" "cam@sf-toucannery.com")))))

;; test that a user that doesn't exist with a *different* domain than the auto-create accounts domain gets an
;; exception
(expect
  clojure.lang.ExceptionInfo
  (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain nil
                                     admin-email                             "rasta@toucans.com"]
    (#'session-api/google-auth-fetch-or-create-user! "Rasta" "Can" "rasta@sf-toucannery.com")))

;; test that a user that doesn't exist with the *same* domain as the auto-create accounts domain means a new user gets
;; created
(expect
  (et/with-fake-inbox
    (tu/with-temporary-setting-values [google-auth-auto-create-accounts-domain "sf-toucannery.com"
                                       admin-email                             "rasta@toucans.com"]
      (u/prog1 (is-session? (#'session-api/google-auth-fetch-or-create-user! "Rasta" "Toucan" "rasta@sf-toucannery.com"))
        (db/delete! User :email "rasta@sf-toucannery.com"))))) ; clean up after ourselves


;;; ------------------------------------------- TESTS FOR LDAP AUTH STUFF --------------------------------------------

;; Test that we can login with LDAP
(expect-with-ldap-server
  true
  ;; delete all other sessions for the bird first, otherwise test doesn't seem to work (TODO - why?)
  (do (db/simple-delete! Session, :user_id (user->id :rasta))
      (tu/is-uuid-string? (:id (client :post 200 "session" (user->credentials :rasta))))))

;; Test that login will fallback to local for users not in LDAP
(expect-with-ldap-server
  true
  ;; delete all other sessions for the bird first, otherwise test doesn't seem to work (TODO - why?)
  (do (db/simple-delete! Session, :user_id (user->id :crowberto))
      (tu/is-uuid-string? (:id (client :post 200 "session" (user->credentials :crowberto))))))

;; Test that login will NOT fallback for users in LDAP but with an invalid password
(expect-with-ldap-server
  {:errors {:password "did not match stored password"}}
  (client :post 400 "session" (user->credentials :lucky))) ; NOTE: there's a different password in LDAP for Lucky

;; Test that login will fallback to local for broken LDAP settings
;; NOTE: This will ERROR out in the logs, it's normal
(expect-with-ldap-server
  true
  (tu/with-temporary-setting-values [ldap-user-base "cn=wrong,cn=com"]
    ;; delete all other sessions for the bird first, otherwise test doesn't seem to work (TODO - why?)
    (do (db/simple-delete! Session, :user_id (user->id :rasta))
        (tu/is-uuid-string? (:id (client :post 200 "session" (user->credentials :rasta)))))))

;; Test that we can login with LDAP with new user
(expect-with-ldap-server
  true
  (u/prog1 (tu/is-uuid-string? (:id (client :post 200 "session" {:username "sbrown20", :password "1234"})))
    (db/delete! User :email "sally.brown@metabase.com"))) ; clean up
