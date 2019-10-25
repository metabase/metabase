(ns metabase.middleware.auth-test
  (:require [expectations :refer [expect]]
            [metabase.middleware
             [auth :as mw.auth]
             [session :as mw.session]
             [util :as middleware.u]]
            [metabase.models.session :refer [Session]]
            [metabase.test.data.users :as test-users]
            [ring.mock.request :as mock]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.sql.Timestamp
           java.util.UUID))

;; create a simple example of our middleware wrapped around a handler that simply returns the request
(defn- auth-enforced-handler [request]
  ((-> (fn [request respond _]
         (respond request))
       mw.auth/enforce-authentication
       mw.session/wrap-current-user-id)
   request
   identity
   (fn [e] (throw e))))


(defn- request-with-session-id
  "Creates a mock Ring request with the given session-id applied"
  [session-id]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-session-id session-id)))


;; no session-id in the request
(expect
  middleware.u/response-unauthentic
  (auth-enforced-handler
   (mock/request :get "/anyurl")))

(defn- random-session-id []
  (str (UUID/randomUUID)))


;; valid session ID
(expect
  (test-users/user->id :rasta)
  (let [session-id (random-session-id)]
    (tt/with-temp Session [_ {:id      session-id
                              :user_id (test-users/user->id :rasta)}]
      (-> (auth-enforced-handler
           (request-with-session-id session-id))
          :metabase-user-id))))


;; expired session-id
;; create a new session (specifically created some time in the past so it's EXPIRED)
;; should fail due to session expiration
(expect
  middleware.u/response-unauthentic
  (let [session-id (random-session-id)]
    (tt/with-temp Session [_ {:id      session-id
                              :user_id (test-users/user->id :rasta)}]
      (db/update-where! Session {:id session-id}
        :created_at (Timestamp. 0))
      (auth-enforced-handler
       (request-with-session-id session-id)))))


;; inactive user session-id
;; create a new session (specifically created some time in the past so it's EXPIRED)
;; should fail due to inactive user
;; NOTE that :trashbird is our INACTIVE test user
(expect
  middleware.u/response-unauthentic
  (let [session-id (random-session-id)]
    (tt/with-temp Session [_ {:id      session-id
                              :user_id (test-users/user->id :trashbird)}]
      (auth-enforced-handler
       (request-with-session-id session-id)))))


;;; ------------------------------------------ TEST wrap-api-key middleware ------------------------------------------

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(defn- wrapped-api-key-handler [request]
  ((mw.auth/wrap-api-key
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))


;; no apikey in the request
(expect
  nil
  (:metabase-session-id
   (wrapped-api-key-handler
    (mock/request :get "/anyurl"))))


;; extract apikey from header
(expect
  "foobar"
  (:metabase-api-key
   (wrapped-api-key-handler
    (mock/header (mock/request :get "/anyurl") @#'mw.auth/metabase-api-key-header "foobar"))))


;;; ---------------------------------------- TEST enforce-api-key middleware -----------------------------------------

;; create a simple example of our middleware wrapped around a handler that simply returns the request
(defn- api-key-enforced-handler [request]
  ((mw.auth/enforce-api-key (fn [_ respond _] (respond {:success true})))
   request
   identity
   (fn [e] (throw e))))


(defn- request-with-api-key
  "Creates a mock Ring request with the given apikey applied"
  [api-key]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-api-key api-key)))


;; no apikey in the request, expect 403
(expect
  middleware.u/response-forbidden
  (api-key-enforced-handler
   (mock/request :get "/anyurl")))


;; valid apikey, expect 200
(expect
  {:success true}
  (api-key-enforced-handler
   (request-with-api-key "test-api-key")))


;; invalid apikey, expect 403
(expect
  middleware.u/response-forbidden
  (api-key-enforced-handler
   (request-with-api-key "foobar")))
