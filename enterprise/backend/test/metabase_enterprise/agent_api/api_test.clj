(ns metabase-enterprise.agent-api.api-test
  "Agent API tests that require enterprise features (JWT authentication, scopes)."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.test.util :as tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defmacro ^:private with-agent-api-setup!
  "Sets up JWT authentication and premium features for Agent API tests."
  [& body]
  `(sso.test-setup/with-jwt-default-setup!
     (mt/with-additional-premium-features #{:agent-api}
       ~@body)))

(defn- current-epoch-seconds []
  (quot (System/currentTimeMillis) 1000))

(defn- sign-jwt [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) sso.test-setup/default-jwt-secret))

(defn- auth-headers
  ([] (auth-headers "rasta@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:email email}))}))

(defn- agent-client
  "Helper for making authenticated agent API requests using JWT."
  [user method expected-status endpoint & [body]]
  (let [email   (:username (mt/user->credentials user))
        headers (auth-headers email)]
    (apply client/client method expected-status endpoint
           {:request-options {:headers headers}}
           (when body [body]))))

(defn- orders-count-query
  "Create a simple count query on the orders table using lib functions."
  []
  (-> (lib/query (mt/metadata-provider)
                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
      (lib/aggregate (lib/count))))

(deftest agent-api-jwt-auth-test
  (with-agent-api-setup!
    (testing "Valid JWT with email claim succeeds"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers)}}))))

    (testing "Email case insensitivity - uppercase email in token"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "RASTA@METABASE.COM")}}))))

    (testing "Email case insensitivity - mixed case email in token"
      (is (= {:message "pong"}
             (client/client :get 200 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "RaStA@MeTaBaSe.CoM")}}))))

    (testing "Bearer scheme is case-insensitive (uppercase BEARER)"
      (let [token    (sign-jwt {:email "rasta@metabase.com"})
            response (client/client :get 200 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" (str "BEARER " token)}}})]
        (is (= {:message "pong"}
               response))))

    (testing "Bearer scheme is case-insensitive (mixed case)"
      (let [token    (sign-jwt {:email "rasta@metabase.com"})
            response (client/client :get 200 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" (str "BeArEr " token)}}})]
        (is (= {:message "pong"}
               response))))))

(deftest agent-api-error-responses-test
  (with-agent-api-setup!
    (testing "Missing authorization header (no session, no JWT)"
      (let [response (client/client :get 401 "agent/v1/ping")]
        (is (= {:error   "missing_authorization"
                :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
               response))))

    (testing "Invalid authorization header format (not Bearer)"
      (let [response (client/client :get 401 "agent/v1/ping"
                                    {:request-options {:headers {"authorization" "Basic xyz"}}})]
        (is (= {:error   "invalid_authorization_format"
                :message "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"}
               response))))

    (testing "Token with non-existent user returns same error as invalid token (no information disclosure)"
      (is (= {:error   "invalid_jwt"
              :message "Invalid or expired JWT token."}
             (client/client :get 401 "agent/v1/ping"
                            {:request-options {:headers (auth-headers "nobody@example.com")}}))))))

(deftest agent-api-inactive-user-test
  (with-agent-api-setup!
    (testing "JWT for deactivated user returns same error as invalid token (no information disclosure)"
      (mt/with-temp [:model/User {email :email} {:is_active false}]
        (is (= {:error   "invalid_jwt"
                :message "Invalid or expired JWT token."}
               (client/client :get 401 "agent/v1/ping"
                              {:request-options {:headers (auth-headers email)}})))))))

(deftest agent-api-user-binding-test
  (with-agent-api-setup!
    (testing "User is correctly bound from JWT - permissions are enforced"
      ;; Create a metric in a collection, then revoke non-admin access
      (mt/with-temp [:model/Collection collection {:name "Private Collection"}
                     :model/Card       metric     {:name          "Private Metric"
                                                   :type          :metric
                                                   :collection_id (:id collection)
                                                   :database_id   (mt/id)
                                                   :dataset_query (orders-count-query)}]
        (mt/with-non-admin-groups-no-collection-perms collection
          (testing "Admin user can access the metric"
            (is (=? {:type "metric"
                     :id   (:id metric)
                     :name "Private Metric"}
                    (agent-client :crowberto :get 200 (str "agent/v1/metric/" (:id metric))))))

          (testing "Non-admin user cannot access the metric"
            (is (= "You don't have permissions to do that."
                   (agent-client :rasta :get 403 (str "agent/v1/metric/" (:id metric)))))))))))

(deftest execute-query-records-query-execution-test
  (with-agent-api-setup!
    (testing "Executed queries are recorded with :agent context"
      (mt/with-temp [:model/User {user-id :id email :email} {:is_superuser true}]
        (let [table-id       (mt/id :orders)
              headers        (auth-headers email)
              construct-resp (client/client :post 200 "agent/v1/construct-query"
                                            {:request-options {:headers headers}}
                                            {:table_id table-id :limit 5})
              _              (client/client :post 202 "agent/v1/execute"
                                            {:request-options {:headers headers}}
                                            {:query (:query construct-resp)})
              ;; QueryExecution is saved asynchronously, so poll for it
              query-execution (tu/poll-until 5000
                                             (t2/select-one :model/QueryExecution :executor_id user-id))]
          (is (= :agent (:context query-execution))))))))

(deftest agent-api-scope-enforcement-test
  (with-agent-api-setup!
    (let [table-id (mt/id :orders)]
      (testing "No scope claim — unscoped JWT can access all endpoints (backwards compat)"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"}))}]
          (is (= {:message "pong"}
                 (client/client :get 200 "agent/v1/ping"
                                {:request-options {:headers headers}})))
          (is (=? {:type "table" :id table-id}
                  (client/client :get 200 (str "agent/v1/table/" table-id)
                                 {:request-options {:headers headers}})))))

      (testing "Matching scope — agent:table:read can access /v1/table/:id"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                                 :scope "agent:table:read"}))}]
          (is (=? {:type "table" :id table-id}
                  (client/client :get 200 (str "agent/v1/table/" table-id)
                                 {:request-options {:headers headers}})))))

      (testing "Wildcard scope — agent:* can access any scoped endpoint"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                                 :scope "agent:*"}))}]
          (is (=? {:type "table" :id table-id}
                  (client/client :get 200 (str "agent/v1/table/" table-id)
                                 {:request-options {:headers headers}})))))

      (testing "Wrong scope — agent:search gets 403 on /v1/table/:id"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                                 :scope "agent:search"}))}]
          (is (= {:error   "unsupported_scope"
                  :message "Token does not have required scope: agent:table:read"}
                 (client/client :get 403 (str "agent/v1/table/" table-id)
                                {:request-options {:headers headers}})))))

      (testing "Scoped JWT on unchecked endpoint — agent:table:read can access /v1/ping"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                                 :scope "agent:table:read"}))}]
          (is (= {:message "pong"}
                 (client/client :get 200 "agent/v1/ping"
                                {:request-options {:headers headers}})))))

      (testing "Empty scope string — gets 403 on scoped endpoints"
        (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                                 :scope ""}))}]
          (is (= {:error   "unsupported_scope"
                  :message "Token does not have required scope: agent:table:read"}
                 (client/client :get 403 (str "agent/v1/table/" table-id)
                                {:request-options {:headers headers}}))))))))

(deftest combined-query-scope-test
  (with-agent-api-setup!
    (testing "agent:query scope grants access to combined query endpoint"
      (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                               :scope "agent:query"}))}]
        (is (= "completed"
               (:status (client/client :post 202 "agent/v1/query"
                                       {:request-options {:headers headers}}
                                       {:table_id (mt/id :orders) :limit 1}))))))

    (testing "agent:* wildcard scope grants access"
      (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                               :scope "agent:*"}))}]
        (is (= "completed"
               (:status (client/client :post 202 "agent/v1/query"
                                       {:request-options {:headers headers}}
                                       {:table_id (mt/id :orders) :limit 1}))))))

    (testing "agent:query:construct scope does NOT grant access to combined endpoint"
      (let [headers {"authorization" (str "Bearer " (sign-jwt {:email "rasta@metabase.com"
                                                               :scope "agent:query:construct"}))}]
        (is (= {:error   "unsupported_scope"
                :message "Token does not have required scope: agent:query"}
               (client/client :post 403 "agent/v1/query"
                              {:request-options {:headers headers}}
                              {:table_id (mt/id :orders) :limit 1})))))))
