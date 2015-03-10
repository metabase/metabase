(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :refer :all]
            [metabase.test-data :refer :all]
            [metabase.models.session :refer [Session]]
            [metabase.test.util :refer [expect-eval-actual-first]]))

;; ## POST /api/session
;; Test that we can login
(expect-eval-actual-first
    (sel :one :fields [Session :id] :user_id (user->id :rasta))
  (do (del Session :user_id (user->id :rasta))                  ; delete all other sessions for the bird first
      (client :post 200 "session" (user->credentials :rasta))))

;; Test for required params
(expect "'email' is a required param."
  (client :post 400 "session" {}))

(expect "'password' is a required param."
  (client :post 400 "session" {:email "anything"}))

;; Test for inactive user (user shouldn't be able to login if :is_active = false)
(expect "Invalid Request."
  (client :post 400 "session" (user->credentials :trashbird)))

;; Test for password checking
(expect "password mismatch"
  (client :post 400 "session" (-> (user->credentials :rasta)
                                (assoc :password "something else"))))


;; ## DELETE /api/session
;; Test that we can logout
(expect-eval-actual-first nil
  (let [{session_id :id} ((user->client :rasta) :post 200 "session" (user->credentials :rasta))]
    (assert session_id)
    ((user->client :rasta) :delete 204 "session" :session_id session_id)
    (sel :one Session :id session_id)))
