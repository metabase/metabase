(ns metabase.server.middleware.auth-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.session :as mw.session]
   [metabase.session.core :as session]
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

;;; ------------------------------------------ TEST verify-slack-request middleware ------------------------------------------

(def ^:private test-signing-secret "test-slack-signing-secret-12345")

(defn- compute-slack-signature
  "Compute a valid Slack signature for testing"
  [body timestamp signing-secret]
  (let [message (str "v0:" timestamp ":" body)
        signature (-> (mac/hash message {:key signing-secret :alg :hmac+sha256})
                      codecs/bytes->hex)]
    (str "v0=" signature)))

(defn- wrapped-slack-handler
  "Invoke verify-slack-request middleware and return the modified request"
  [request]
  ((mw.auth/verify-slack-request
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(defn- slack-request
  "Create a mock request with Slack signature headers and a body"
  ^java.util.Map [^String body ^String timestamp ^String signature]
  (-> (ring.mock/request :post "/anyurl")
      (ring.mock/header "x-slack-signature" signature)
      (ring.mock/header "x-slack-request-timestamp" timestamp)
      (assoc :body (java.io.ByteArrayInputStream. (.getBytes body "UTF-8")))))

(deftest verify-slack-request-test
  (mt/with-premium-features #{:metabot-v3}
    (testing "Valid signature w/ signing secret configured"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret]
        (let [body "test-body"
              timestamp "1234567890"
              signature (compute-slack-signature body timestamp test-signing-secret)
              result (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (true? (:slack/validated? result))))))

    (testing "Invalid signature"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret]
        (let [body "test-body"
              timestamp "1234567890"
              signature "v0=invalid-signature"
              result (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (false? (:slack/validated? result))))))

    (testing "No signature header present - request passes through unchanged"
      (let [body "test-body"
            request (-> (ring.mock/request :post "/anyurl")
                        (assoc :body (java.io.ByteArrayInputStream. (.getBytes ^String body "UTF-8"))))
            result (wrapped-slack-handler request)]
        (is (not (contains? result :slack/validated?)))))

    (testing "No signing secret configured"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret nil]
        (let [body "test-body"
              timestamp "1234567890"
              signature "v0=some-signature"
              result (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (nil? (:slack/validated? result))))))))
