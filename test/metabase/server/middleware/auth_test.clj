(ns metabase.server.middleware.auth-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.session :refer [Session]]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  (-> (ring.mock/request :get "/anyurl")
      (assoc :metabase-session-id session-id)))

(defn- random-session-id []
  (str (random-uuid)))

(deftest wrap-current-user-info-test
  (testing "Valid requests should add `metabase-user-id` to requests with valid session info"
    (let [session-id (random-session-id)]
      (try
        (t2/insert! Session {:id      session-id
                             :user_id (test.users/user->id :rasta)})
        (is (= (test.users/user->id :rasta)
               (-> (auth-enforced-handler (request-with-session-id session-id))
                   :metabase-user-id)))
        (finally (t2/delete! Session :id session-id)))))

  (testing "Invalid requests should return unauthed response"
    (testing "when no session ID is sent with request"
      (is (= req.util/response-unauthentic
             (auth-enforced-handler
              (ring.mock/request :get "/anyurl")))))

    (testing "when an expired session ID is sent with request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED) should fail due to session
      ;; expiration
      (let [session-id (random-session-id)]
        (try
          (t2/insert! Session {:id      session-id
                               :user_id (test.users/user->id :rasta)})
          (t2/update! (t2/table-name Session) {:id session-id}
            {:created_at (t/instant 1000)})
          (is (= req.util/response-unauthentic
                 (auth-enforced-handler (request-with-session-id session-id))))
          (finally (t2/delete! Session :id session-id)))))

    (testing "when a Session tied to an inactive User is sent with the request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED)
      ;; should fail due to inactive user
      ;; NOTE that :trashbird is our INACTIVE test user
      (let [session-id (random-session-id)]
        (try
          (t2/insert! Session {:id      session-id
                               :user_id (test.users/user->id :trashbird)})
          (is (= req.util/response-unauthentic
                 (auth-enforced-handler
                  (request-with-session-id session-id))))
          (finally (t2/delete! Session :id session-id)))))))


;;; ------------------------------------------ TEST wrap-static-api-key middleware ------------------------------------------

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(defn- wrapped-api-key-handler [request]
  ((mw.auth/wrap-static-api-key
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(deftest wrap-static-api-key-test
  (testing "No API key in the request"
    (is (nil?
         (:metabase-session-id
          (wrapped-api-key-handler
           (ring.mock/request :get "/anyurl"))))))

  (testing "API Key in header"
    (is (= "foobar"
           (:static-metabase-api-key
            (wrapped-api-key-handler
             (ring.mock/header (ring.mock/request :get "/anyurl") @#'mw.auth/static-metabase-api-key-header "foobar")))))))


;;; ---------------------------------------- TEST enforce-static-api-key middleware -----------------------------------------

;; create a simple example of our middleware wrapped around a handler that simply returns the request
(defn- api-key-enforced-handler [request]
  ((mw.auth/enforce-static-api-key (fn [_ respond _] (respond {:success true})))
   request
   identity
   (fn [e] (throw e))))

(defn- request-with-api-key
  "Creates a mock Ring request with the given apikey applied"
  [api-key]
  (-> (ring.mock/request :get "/anyurl")
      (assoc :static-metabase-api-key api-key)))

(deftest enforce-static-api-key-request
  (mt/with-temporary-setting-values [api-key "test-api-key"]
    (testing "no apikey in the request, expect 403"
      (is (= req.util/response-forbidden
             (api-key-enforced-handler
              (ring.mock/request :get "/anyurl")))))

    (testing "valid apikey, expect 200"
      (is (= {:success true}
             (api-key-enforced-handler
              (request-with-api-key "test-api-key")))))

    (testing "invalid apikey, expect 403"
      (is (= req.util/response-forbidden
             (api-key-enforced-handler
              (request-with-api-key "foobar"))))))

  (testing "no apikey is set, expect 403"
    (doseq [api-key-value [nil ""]]
      (testing (str "when key is " ({nil "nil" "" "empty"} api-key-value))
       (mt/with-temporary-setting-values [api-key api-key-value]
         (is (= mw.auth/key-not-set-response
                (api-key-enforced-handler
                 (ring.mock/request :get "/anyurl")))))))))
