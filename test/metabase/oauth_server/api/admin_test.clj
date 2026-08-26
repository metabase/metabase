(ns metabase.oauth-server.api.admin-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
   :registration_type  "dynamic"})

(defn- event-defaults
  ([oauth-client-id event-type]
   (event-defaults oauth-client-id event-type nil))
  ([oauth-client-id event-type user-id]
   (cond-> {:oauth_client_id oauth-client-id
            :event_type      event-type}
     user-id (assoc :user_id user-id))))

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

(deftest authorizations-returns-events-test
  (testing "Registration and decision events are returned with client info"
    (mt/with-temp [:model/OAuthClient client (merge (client-defaults)
                                                    {:client_name "My MCP Client"
                                                     :client_uri  "https://mcp.example.com"})
                   :model/OAuthClientEvent registered (event-defaults (:id client) "registered")
                   :model/OAuthClientEvent approved (event-defaults (:id client) "approved" (mt/user->id :crowberto))
                   :model/OAuthClientEvent denied (event-defaults (:id client) "denied" (mt/user->id :rasta))]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client))
            ids      (set (map :id (:data response)))]
        (is (= 3 (:total response)))
        (is (= #{(:id registered) (:id approved) (:id denied)} ids))
        (is (= #{"registered" "approved" "denied"} (set (map :event_type (:data response)))))
        (doseq [row (:data response)]
          (is (= "My MCP Client" (:client_name row)))
          (is (= "https://mcp.example.com" (:client_uri row)))
          (is (= ["https://example.com/callback"] (:redirect_uris row))
              "redirect_uris is decoded from JSON into a vector")
          (is (= (:client_id client) (:client_id row)))
          (is (= (:id client) (:oauth_client_id row))))))))

(deftest authorizations-decision-events-have-user-test
  (testing "Decision events expose the deciding user; registration events have no user"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent _registered (event-defaults (:id client) "registered")
                   :model/OAuthClientEvent _approved (event-defaults (:id client) "approved" (mt/user->id :crowberto))]
      (let [rows   (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                                :client-id (:client_id client)))
            by-typ (into {} (map (juxt :event_type identity)) rows)]
        (is (= (mt/user->id :crowberto) (:user_id (get by-typ "approved"))))
        (is (some? (:user_email (get by-typ "approved"))))
        (is (nil? (:user_id (get by-typ "registered"))))
        (is (nil? (:user_email (get by-typ "registered"))))))))

(deftest authorizations-filter-by-event-type-test
  (testing "Can filter by event-type=approved"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent _registered (event-defaults (:id client) "registered")
                   :model/OAuthClientEvent _approved (event-defaults (:id client) "approved" (mt/user->id :crowberto))
                   :model/OAuthClientEvent _denied (event-defaults (:id client) "denied" (mt/user->id :rasta))]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client)
                                           :event-type "approved")]
        (is (= 1 (:total response)))
        (is (= "approved" (:event_type (first (:data response)))))))))

(deftest authorizations-filter-by-client-id-test
  (testing "Can filter by client-id"
    (mt/with-temp [:model/OAuthClient client-a (merge (client-defaults) {:client_name "Client A"})
                   :model/OAuthClient client-b (merge (client-defaults) {:client_name "Client B"})
                   :model/OAuthClientEvent _a (event-defaults (:id client-a) "registered")
                   :model/OAuthClientEvent _b (event-defaults (:id client-b) "registered")]
      (let [response (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                           :client-id (:client_id client-a))]
        (is (= 1 (:total response)))
        (is (= "Client A" (:client_name (first (:data response)))))))))

(deftest authorizations-ordered-by-created-at-desc-test
  (testing "Results are ordered by created_at descending"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent _first (event-defaults (:id client) "registered")]
      ;; Insert second event after a short delay so created_at differs
      (Thread/sleep 50)
      (mt/with-temp [:model/OAuthClientEvent _second (event-defaults (:id client) "approved" (mt/user->id :crowberto))]
        (let [rows (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                                :client-id (:client_id client)))]
          (is (= 2 (count rows)))
          (is (= "approved" (:event_type (first rows))))
          (is (= "registered" (:event_type (second rows)))))))))

(deftest authorizations-pagination-test
  (testing "Pagination works with limit and offset"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent _a (event-defaults (:id client) "registered")
                   :model/OAuthClientEvent _b (event-defaults (:id client) "approved" (mt/user->id :crowberto))
                   :model/OAuthClientEvent _c (event-defaults (:id client) "denied" (mt/user->id :crowberto))]
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

(deftest authorizations-retains-events-for-deleted-client-test
  (testing "Events whose client has been deleted still surface (LEFT JOIN), with null client fields"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent event (event-defaults (:id client) "registered")]
      (t2/delete! :model/OAuthClient (:id client))
      (let [rows (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"))
            row  (first (filter #(= (:id event) (:id %)) rows))]
        (is (some? row) "The orphaned audit event should still be returned")
        (is (= "registered" (:event_type row)))
        (is (nil? (:oauth_client_id row)))
        (is (nil? (:client_id row)))
        (is (nil? (:client_name row)))
        (is (nil? (:redirect_uris row)))))))

(deftest authorizations-does-not-leak-sensitive-fields-test
  (testing "Response does not include secrets or token-endpoint auth details"
    (mt/with-temp [:model/OAuthClient client (client-defaults)
                   :model/OAuthClientEvent _registered (event-defaults (:id client) "registered")]
      (let [row (first (:data (mt/user-http-request :crowberto :get 200 "oauth/authorizations"
                                                    :client-id (:client_id client))))]
        (is (nil? (:client_secret_hash row)))
        (is (nil? (:registration_access_token_hash row)))
        (is (nil? (:token_endpoint_auth_method row)))))))
