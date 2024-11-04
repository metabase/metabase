(ns metabase.server.middleware.auth-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.session :refer [Session]]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.request.util :as req.util]
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
