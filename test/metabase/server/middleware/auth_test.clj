(ns metabase.server.middleware.auth-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.session :as mw.session]
   [metabase.session.core :as session]
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
       (#'api.routes.common/enforce-authentication)
       mw.session/wrap-current-user-info)
   request
   identity
   (fn [e] (throw e))))

(defn- request-with-session-key
  "Creates a mock Ring request with the given session-key applied"
  [session-key]
  (-> (ring.mock/request :get "/anyurl")
      (assoc :metabase-session-key session-key)))

(deftest wrap-current-user-info-test
  (testing "Valid requests should add `metabase-user-id` to requests with valid session info"
    (let [session-id (session/generate-session-id)
          session-key (session/generate-session-key)
          session-key-hashed (session/hash-session-key session-key)]
      (try
        (t2/insert! :model/Session {:id         session-id
                                    :key_hashed session-key-hashed
                                    :user_id    (test.users/user->id :rasta)})
        (is (= (test.users/user->id :rasta)
               (-> (auth-enforced-handler (request-with-session-key session-key))
                   :metabase-user-id)))
        (finally (t2/delete! :model/Session :id session-id)))))

  (testing "Invalid requests should return unauthed response"
    (testing "when no session ID is sent with request"
      (is (= api.response/response-unauthentic
             (auth-enforced-handler
              (ring.mock/request :get "/anyurl")))))

    (testing "when an expired session ID is sent with request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED) should fail due to session
      ;; expiration
      (let [session-id (session/generate-session-id)
            session-key (session/generate-session-key)
            session-key-hashed (session/hash-session-key session-key)]
        (try
          (t2/insert! :model/Session {:id      session-id
                                      :key_hashed session-key-hashed
                                      :user_id (test.users/user->id :rasta)})
          (t2/update! (t2/table-name :model/Session) {:id session-id}
                      {:created_at (t/instant 1000)})
          (is (= api.response/response-unauthentic
                 (auth-enforced-handler (request-with-session-key session-key))))
          (finally (t2/delete! :model/Session :id session-id)))))

    (testing "when a Session tied to an inactive User is sent with the request"
      ;; create a new session (specifically created some time in the past so it's EXPIRED)
      ;; should fail due to inactive user
      ;; NOTE that :trashbird is our INACTIVE test user
      (let [session-id (session/generate-session-id)
            session-key (session/generate-session-key)
            session-key-hashed (session/hash-session-key session-key)]
        (try
          (t2/insert! :model/Session {:id         session-id
                                      :key_hashed session-key-hashed
                                      :user_id    (test.users/user->id :trashbird)})
          (is (= api.response/response-unauthentic
                 (auth-enforced-handler
                  (request-with-session-key session-key))))
          (finally (t2/delete! :model/Session :id session-id)))))))

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
         (:metabase-session-key
          (wrapped-api-key-handler
           (ring.mock/request :get "/anyurl"))))))

  (testing "API Key in header"
    (is (= "foobar"
           (:static-metabase-api-key
            (wrapped-api-key-handler
             (ring.mock/header (ring.mock/request :get "/anyurl") @#'mw.auth/static-metabase-api-key-header "foobar")))))))
