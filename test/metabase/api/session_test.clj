(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.test-data :refer :all]
            [metabase.models.session :refer [Session]]
            [metabase.test.util :refer [expect-eval-actual-first]]))

;; ## POST /api/session
;; Test that we can login
(expect-eval-actual-first
    (sel :one :fields [Session :id] :user_id (user->id :rasta) (order :created_at :desc))
  ((user->client :rasta) :post 200 "session" (user->credentials :rasta)))

;; ## DELETE /api/session
;; Test that we can logout
(expect-eval-actual-first nil
  (let [{session_id :id} ((user->client :rasta) :post 200 "session" (user->credentials :rasta))]
    (assert session_id)
    ((user->client :rasta) :delete 204 "session" :session_id session_id)
    (sel :one Session :id session_id)))
