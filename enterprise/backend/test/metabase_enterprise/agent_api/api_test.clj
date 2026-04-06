(ns metabase-enterprise.agent-api.api-test
  "Agent API tests that require enterprise features (JWT authentication, scopes)."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.metabot.settings] ; for setting definitions
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
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

(deftest get-table-details-test
  (with-agent-api-setup!
    (testing "Returns table details for valid table ID"
      (let [table-id (mt/id :orders)]
        (is (=? {:type           "table"
                 :id             table-id
                 :name           "ORDERS"
                 :display_name   "Orders"
                 :database_id    (mt/id)
                 :fields         sequential?
                 :related_tables sequential?}
                (agent-client :rasta :get 200 (str "agent/v1/table/" table-id))))))

    (testing "Returns 404 for non-existent table"
      (is (= "Not found."
             (agent-client :rasta :get 404 "agent/v1/table/999999"))))

    (testing "Respects query parameters"
      (let [table-id (mt/id :orders)]
        (is (=? {:type   "table"
                 :id     table-id
                 :fields empty?}
                (agent-client :rasta :get 200
                              (str "agent/v1/table/" table-id "?with-fields=false&with-related-tables=false"))))))

    (testing "Field values are excluded by default"
      (let [table-id (mt/id :orders)
            table    (agent-client :rasta :get 200 (str "agent/v1/table/" table-id))]
        (is (every? #(nil? (:field_values %)) (:fields table)))))

    (testing "Field values are included when explicitly requested"
      (let [table-id (mt/id :orders)
            table    (agent-client :rasta :get 200 (str "agent/v1/table/" table-id "?with-field-values=true"))]
        (is (some #(seq (:field_values %)) (:fields table)))))))

(deftest get-metric-details-test
  (with-agent-api-setup!
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :dataset_query (orders-count-query)}]
      (testing "Returns metric details for valid metric ID"
        (is (=? {:type                 "metric"
                 :id                   (:id metric)
                 :name                 "Test Metric"
                 :queryable_dimensions sequential?}
                (agent-client :rasta :get 200 (str "agent/v1/metric/" (:id metric))))))

      (testing "Respects query parameters"
        (is (=? {:type "metric"
                 :id   (:id metric)}
                (agent-client :rasta :get 200
                              (str "agent/v1/metric/" (:id metric)
                                   "?with-queryable-dimensions=false&with-field-values=false")))))

      (testing "Returns 404 for non-existent metric"
        (is (= "Not found."
               (agent-client :rasta :get 404 "agent/v1/metric/999999")))))))

(defn- ensure-fresh-field-values!
  "Ensure field values exist for a field by deleting any existing ones and recreating them."
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id :type :full)
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id field-id)))

(defn- visible-field-id
  "Find the field-id string for a field by display name within a table's visible columns."
  [table-id field-display-name]
  (let [mp            (mt/metadata-provider)
        query         (lib/query mp (lib.metadata/table mp table-id))
        field-prefix  (metabot.tools.u/table-field-id-prefix table-id)
        visible-cols  (lib/visible-columns query)]
    (->> (keep-indexed (fn [i col]
                         (when (= (lib/display-name query col) field-display-name)
                           (str field-prefix i)))
                       visible-cols)
         first)))

(deftest get-table-field-values-test
  (with-agent-api-setup!
    ;; Ensure field values exist for the field we'll test
    (ensure-fresh-field-values! (mt/id :people :state))

    (testing "Returns field statistics and values with default limit of 30"
      (let [table-id (mt/id :people)
            field-id (visible-field-id table-id "State")]
        (is (some? field-id) "Should find the State field")
        (let [result (agent-client :crowberto :get 200
                                   (format "agent/v1/table/%d/field/%s/values" table-id field-id))]
          (is (=? {:value_metadata {:statistics   {:distinct-count 49}
                                    :field_values sequential?}}
                  result))
          (is (<= (count (:values result)) 30) "Should apply default limit of 30"))))

    (testing "Respects explicit limit parameter"
      (let [table-id (mt/id :people)
            field-id (visible-field-id table-id "State")]
        (is (=? {:value_metadata {:field_values #(= 5 (count %))}}
                (agent-client :crowberto :get 200
                              (format "agent/v1/table/%d/field/%s/values?limit=5" table-id field-id))))))

    (testing "Returns 404 for non-existent table"
      (is (= "Not found."
             (agent-client :crowberto :get 404 "agent/v1/table/999999/field/t999999-0/values"))))

    (testing "Returns 400 for invalid field-id format"
      (let [table-id (mt/id :people)]
        (is (= "Invalid field_id format: not-a-valid-id"
               (agent-client :crowberto :get 400 (format "agent/v1/table/%d/field/not-a-valid-id/values" table-id))))))))

(deftest search-test
  (with-agent-api-setup!
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Table _ {:name "AgentSearchTestTable"}]
        (testing "Returns search results for term queries"
          (is (=? {:data        [{:type "table" :name "AgentSearchTestTable"}]
                   :total_count 1}
                  (agent-client :rasta :post 200 "agent/v1/search"
                                {:term_queries ["AgentSearchTestTable"]}))))))))

(defn- decode-query
  "Decode a base64-encoded query response to a Clojure map, then normalize it so lib functions work."
  [response]
  (-> response :query u/decode-base64 json/decode+kw lib.normalize/normalize))

(deftest construct-query-test
  (with-agent-api-setup!
    (testing "Constructs a simple query from a table"
      (let [table-id (mt/id :orders)
            response (agent-client :rasta :post 200 "agent/v1/construct-query"
                                   {:table_id table-id})]
        (is (string? (:query response)) "Response should contain a query string")
        (let [decoded (decode-query response)]
          (is (= :mbql/query (lib/normalized-query-type decoded)))
          (is (= (mt/id) (lib/database-id decoded)))
          (is (= (mt/id :orders) (lib/primary-source-table-id decoded))))))

    (testing "Applies default limit of 200 when no limit is specified"
      (let [table-id (mt/id :orders)
            response (agent-client :rasta :post 200 "agent/v1/construct-query"
                                   {:table_id table-id})
            decoded  (decode-query response)]
        (is (= 200 (lib/current-limit decoded)))))

    (testing "Respects explicit limit"
      (let [table-id (mt/id :orders)
            response (agent-client :rasta :post 200 "agent/v1/construct-query"
                                   {:table_id table-id
                                    :limit    10})
            decoded  (decode-query response)]
        (is (= 10 (lib/current-limit decoded)))))

    (testing "Returns 404 for non-existent table"
      (is (= "No table found with table_id 999999"
             (agent-client :rasta :post 404 "agent/v1/construct-query"
                           {:table_id 999999}))))))

(deftest execute-query-test
  (with-agent-api-setup!
    (testing "Executes a query and returns results with column metadata"
      (let [table-id       (mt/id :orders)
            construct-resp (agent-client :rasta :post 200 "agent/v1/construct-query"
                                         {:table_id table-id
                                          :limit    5})
            ;; Streaming response returns 202 (accepted) since it starts streaming before completion
            execute-resp   (agent-client :rasta :post 202 "agent/v1/execute"
                                         {:query (:query construct-resp)})]
        (is (=? {:status    "completed"
                 :row_count 5
                 :data      {:cols (fn [cols]
                                     (and (seq cols)
                                          (every? :name cols)
                                          (every? :base_type cols)))
                             :rows (fn [rows] (= 5 (count rows)))}}
                execute-resp))))

    (testing "Enforces agent query row limit even when query specifies a higher limit"
      (let [table-id       (mt/id :orders)
            construct-resp (agent-client :rasta :post 200 "agent/v1/construct-query"
                                         {:table_id table-id
                                          :limit    300})
            execute-resp   (agent-client :rasta :post 202 "agent/v1/execute"
                                         {:query (:query construct-resp)})]
        (is (=? {:status "completed" :row_count 200}
                execute-resp))))))

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
                  :message "Insufficient scope for this operation."}
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
                  :message "Insufficient scope for this operation."}
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
                :message "Insufficient scope for this operation."}
               (client/client :post 403 "agent/v1/query"
                              {:request-options {:headers headers}}
                              {:table_id (mt/id :orders) :limit 1})))))))
