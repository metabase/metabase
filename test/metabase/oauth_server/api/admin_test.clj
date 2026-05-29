(ns metabase.oauth-server.api.admin-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [oidc-provider.util :as oidc-util]))

(defn- client-defaults []
  {:client_id          (str (random-uuid))
   :client_type        "confidential"
   :client_secret_hash (oidc-util/hash-client-secret (oidc-util/generate-client-secret))
   :redirect_uris      ["https://example.com/callback"]
   :client_name        "Test Auth Client"
   :grant_types        ["authorization_code" "refresh_token"]
   :response_types     ["code"]
   :scopes             ["profile"]
   :application_type   "web"
   :registration_type  "static"})

(defn- auth-code-defaults [client-id user-id decision]
  (cond-> {:code         (str (random-uuid))
           :user_id      user-id
           :client_id    client-id
           :redirect_uri "https://example.com/callback"
           :scope        ["profile"]
           :expiry       (+ (System/currentTimeMillis) 600000)
           :decision     decision}
    (not= decision "pending") (assoc :decided_at :%now)))

;;; ----------------------------------------- GET /api/oauth/authorizations ----------------------------------------

(deftest authorizations-requires-superuser-test
  (testing "Non-admin gets 403"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "oauth/authorizations")))))

(deftest authorizations-response-shape-test
  (testing "Response has the expected pagination shape"
    (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations")]
      (is (number? (:total response)))
      (is (sequential? (:data response)))
      (is (pos-int? (:limit response)))
      (is (number? (:offset response))))))

(deftest authorizations-excludes-pending-test
  (testing "Pending authorizations are not returned"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthAuthorizationCode _code
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "pending")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client))]
        (is (= 0 (:total response)))))))

(deftest authorizations-returns-decided-rows-test
  (testing "Authorized and denied decisions are returned with client and user info"
    (mt/with-temp [:model/OAuthClient client (merge (client-defaults)
                                                    {:client_name "My MCP Client"
                                                     :client_uri  "https://mcp.example.com"})
                   :model/OAuthAuthorizationCode auth1
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")
                   :model/OAuthAuthorizationCode auth2
                   (auth-code-defaults (:client_id client) (mt/user->id :rasta) "denied")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client))
            ids      (set (map :id (:data response)))]
        (is (= 2 (:total response)))
        (is (= #{(:id auth1) (:id auth2)} ids))
        (let [decisions (set (map :decision (:data response)))]
          (is (= #{"authorized" "denied"} decisions)))
        (doseq [row (:data response)]
          (is (= "My MCP Client" (:client_name row)))
          (is (= "https://mcp.example.com" (:client_uri row)))
          (is (some? (:user_email row)))
          (is (some? (:decided_at row))))))))

(deftest authorizations-filter-by-decision-test
  (testing "Can filter by decision=authorized"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthAuthorizationCode _auth
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")
                   :model/OAuthAuthorizationCode _denied
                   (auth-code-defaults (:client_id client) (mt/user->id :rasta) "denied")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client)
                                           :decision "authorized")]
        (is (= 1 (:total response)))
        (is (= "authorized" (:decision (first (:data response)))))))))

(deftest authorizations-filter-by-client-id-test
  (testing "Can filter by client-id"
    (mt/with-temp [:model/OAuthClient client-a (merge (client-defaults) {:client_name "Client A"})
                   :model/OAuthClient client-b (merge (client-defaults) {:client_name "Client B"})
                   :model/OAuthAuthorizationCode _a
                   (auth-code-defaults (:client_id client-a) (mt/user->id :crowberto) "authorized")
                   :model/OAuthAuthorizationCode _b
                   (auth-code-defaults (:client_id client-b) (mt/user->id :crowberto) "authorized")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client-a))]
        (is (= 1 (:total response)))
        (is (= "Client A" (:client_name (first (:data response)))))))))

(deftest authorizations-ordered-by-decided-at-desc-test
  (testing "Results are ordered by decided_at descending"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthAuthorizationCode _first
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")]
      ;; Insert second row after a short delay so decided_at differs
      (Thread/sleep 50)
      (mt/with-temp [:model/OAuthAuthorizationCode _second
                     (auth-code-defaults (:client_id client) (mt/user->id :rasta) "denied")]
        (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                             :client-id (:client_id client))
              rows     (:data response)]
          (is (= 2 (count rows)))
          (is (= "denied" (:decision (first rows))))
          (is (= "authorized" (:decision (second rows)))))))))

(deftest authorizations-pagination-test
  (testing "Pagination works with limit and offset"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthAuthorizationCode _a
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")
                   :model/OAuthAuthorizationCode _b
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")
                   :model/OAuthAuthorizationCode _c
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client)
                                           :limit 2 :offset 0)]
        (is (= 3 (:total response)))
        (is (= 2 (count (:data response))))
        (is (= 2 (:limit response)))
        (is (= 0 (:offset response))))
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client)
                                           :limit 2 :offset 2)]
        (is (= 3 (:total response)))
        (is (= 1 (count (:data response))))))))

(deftest authorizations-does-not-leak-sensitive-fields-test
  (testing "Response does not include code, redirect_uri, nonce, or PKCE fields"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthAuthorizationCode _auth
                   (auth-code-defaults (:client_id client) (mt/user->id :crowberto) "authorized")]
      (let [row (first (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                                    :client-id (:client_id client))))]
        (is (nil? (:code row)))
        (is (nil? (:redirect_uri row)))
        (is (nil? (:nonce row)))
        (is (nil? (:code_challenge row)))
        (is (nil? (:code_challenge_method row)))
        (is (nil? (:expiry row)))))))
