(ns metabase.middleware.auth-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.middleware
             [auth :as mw.auth]
             [session :as mw.session]
             [util :as middleware.u]]
            [metabase.models.session :refer [Session]]
            [metabase.test :as mt]
            [metabase.test.data.users :as test-users]
            [metabase.test.fixtures :as fixtures]
            [ring.mock.request :as mock]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.util.UUID))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

;; create a simple example of our middleware wrapped around a handler that simply returns the request
(defn- auth-enforced-handler [request]
  ((-> (fn [request respond _]
         (respond request))
       mw.auth/enforce-authentication
       mw.session/wrap-current-user-info)
   request
   identity
   (fn [e] (throw e))))


(defn- request-with-session-id
  "Creates a mock Ring request with the given session-id applied"
  [session-id]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-session-id session-id)))

(defn- random-session-id []
  (str (UUID/randomUUID)))

(deftest wrap-current-user-info-test
  (testing "Valid requests should add `metabase-user-id` to requests with valid session info"
    (let [session-id (random-session-id)]
      (tt/with-temp Session [_ {:id      session-id
                                :user_id (test-users/user->id :rasta)}]
        (is (= (test-users/user->id :rasta)
               (-> (auth-enforced-handler (request-with-session-id session-id))
                   :metabase-user-id))))))

  (testing "Invalid requests should return unauthed response"
    (testing "when no session ID is sent with request"
      (is (= middleware.u/response-unauthentic
             (auth-enforced-handler
              (mock/request :get "/anyurl")))))

    (testing "when an expired session ID is sent with request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED) should fail due to session
      ;; expiration
      (let [session-id (random-session-id)]
        (tt/with-temp Session [_ {:id      session-id
                                  :user_id (test-users/user->id :rasta)}]
          (db/update-where! Session {:id session-id}
            :created_at (t/instant 0))
          (is (= middleware.u/response-unauthentic
                 (auth-enforced-handler (request-with-session-id session-id)))))))

    (testing "when a Session tied to an inactive User is sent with the request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED)
      ;; should fail due to inactive user
      ;; NOTE that :trashbird is our INACTIVE test user
      (let [session-id (random-session-id)]
        (tt/with-temp Session [_ {:id      session-id
                                  :user_id (test-users/user->id :trashbird)}]
          (is (= middleware.u/response-unauthentic
                 (auth-enforced-handler
                  (request-with-session-id session-id)))))))))


;;; ------------------------------------------ TEST wrap-api-key middleware ------------------------------------------

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(defn- wrapped-api-key-handler [request]
  ((mw.auth/wrap-api-key
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(deftest wrap-api-key-test
  (testing "No API key in the request"
    (is (= nil
           (:metabase-session-id
            (wrapped-api-key-handler
             (mock/request :get "/anyurl"))))))

  (testing "API Key in header"
    (is (= "foobar"
           (:metabase-api-key
            (wrapped-api-key-handler
             (mock/header (mock/request :get "/anyurl") @#'mw.auth/metabase-api-key-header "foobar")))))))


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

(deftest enforce-api-key-request
  (mt/with-temporary-setting-values [api-key "test-api-key"]
    (testing "no apikey in the request, expect 403"
      (is (= middleware.u/response-forbidden
             (api-key-enforced-handler
              (mock/request :get "/anyurl")))))

    (testing "valid apikey, expect 200"
      (is (= {:success true}
             (api-key-enforced-handler
              (request-with-api-key "test-api-key")))))

    (testing "invalid apikey, expect 403"
      (is (= middleware.u/response-forbidden
             (api-key-enforced-handler
              (request-with-api-key "foobar")))))))
