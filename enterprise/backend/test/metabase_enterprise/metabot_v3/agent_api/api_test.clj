(ns metabase-enterprise.metabot-v3.agent-api.api-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.settings] ; for setting definitions
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.session.models.session :as session.models]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- current-epoch-seconds []
  (int (/ (System/currentTimeMillis) 1000)))

(defn- sign-jwt
  "Sign a JWT with the test secret. Automatically adds `iat` claim if not present,
   which is required for max-age validation."
  [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) sso.test-setup/default-jwt-secret))

(defmacro with-agent-api-setup!
  "Sets up JWT authentication for Agent API tests.
   Reuses the SSO JWT test setup which handles premium features and settings correctly."
  [& body]
  `(sso.test-setup/with-jwt-default-setup!
     (mt/with-additional-premium-features #{:agent-api :metabot-v3}
       ~@body)))

(defn- auth-headers
  "Create authorization headers with a signed JWT for the given email."
  ([]
   (auth-headers "rasta@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:email email}))}))

(defn- agent-client
  "Helper for making authenticated agent API requests, similar to mt/user-http-request.
   Takes a test user keyword (e.g. :rasta, :crowberto), method, expected status, endpoint,
   and optional body for POST/PUT requests."
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

(deftest agent-api-session-token-auth-test
  (with-agent-api-setup!
    (testing "Session tokens via X-Metabase-Session header authenticate successfully"
      (let [session-key (session.models/generate-session-key)
            _           (t2/insert! :model/Session
                                    {:id          (session.models/generate-session-id)
                                     :user_id     (mt/user->id :rasta)
                                     :session_key session-key})
            response    (client/client :get 200 "agent/v1/ping"
                                       {:request-options {:headers {"x-metabase-session" session-key}}})]
        (is (= {:message "pong"} response))))

    (testing "Invalid session token returns 401"
      (let [fake-session-key (str (random-uuid))
            response         (client/client :get 401 "agent/v1/ping"
                                            {:request-options {:headers {"x-metabase-session" fake-session-key}}})]
        ;; Invalid session means standard middleware doesn't set metabase-user-id,
        ;; so our middleware sees no auth and returns missing_authorization
        (is (= {:error   "missing_authorization"
                :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
               response))))))

(deftest agent-api-inactive-user-test
  (with-agent-api-setup!
    (testing "JWT for deactivated user returns same error as invalid token (no information disclosure)"
      (mt/with-temp [:model/User {email :email} {:is_active false}]
        (is (= {:error   "invalid_jwt"
                :message "Invalid or expired JWT token."}
               (client/client :get 401 "agent/v1/ping"
                              {:request-options {:headers (auth-headers email)}})))))))

(deftest agent-api-expired-session-test
  (testing "Expired sessions are rejected by the standard session middleware"
    (with-agent-api-setup!
      ;; Set max-session-age to 1 minute for this test
      (with-redefs [env/env (assoc env/env :max-session-age "1")]
        (let [session-key (session.models/generate-session-key)
              old-time    (t/minus (t/instant) (t/minutes 2))]
          (mt/with-temp [:model/Session _ {:user_id     (mt/user->id :rasta)
                                           :session_key session-key
                                           :created_at  old-time}]
            (testing "Session older than max-session-age is rejected"
              (is (= {:error   "missing_authorization"
                      :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
                     (client/client :get 401 "agent/v1/ping"
                                    {:request-options {:headers {"x-metabase-session" session-key}}}))))))))))

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
                              (str "agent/v1/table/" table-id "?with-fields=false&with-related-tables=false"))))))))

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
        field-prefix  (metabot-v3.tools.u/table-field-id-prefix table-id)
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

    (testing "Returns field statistics and values for a table field"
      (let [table-id (mt/id :people)
            field-id (visible-field-id table-id "State")]
        (is (some? field-id) "Should find the State field")
        (is (=? {:statistics {:distinct_count 49}
                 :values     sequential?}
                (agent-client :crowberto :get 200
                              (format "agent/v1/table/%d/field/%s/values" table-id field-id))))))

    (testing "Respects limit parameter"
      (let [table-id (mt/id :people)
            field-id (visible-field-id table-id "State")
            result   (agent-client :crowberto :get 200
                                   (format "agent/v1/table/%d/field/%s/values?limit=5" table-id field-id))]
        (is (= 5 (count (:values result))) "Should respect limit parameter")))

    (testing "Returns 404 for non-existent table"
      (is (= "Not found."
             (agent-client :crowberto :get 404 "agent/v1/table/999999/field/t999999-0/values"))))))

(deftest search-test
  (with-agent-api-setup!
    (binding [search.ingestion/*force-sync* true]
      (search.tu/with-new-search-if-available-otherwise-legacy
        (mt/with-temp [:model/Table _ {:name "AgentSearchTestTable"}]
          (testing "Returns search results for term queries"
            (is (=? {:data        [{:type "table" :name "AgentSearchTestTable"}]
                     :total_count 1}
                    (agent-client :rasta :post 200 "agent/v1/search"
                                  {:term_queries ["AgentSearchTestTable"]})))))))))

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
          (is (= (mt/id :orders) (lib/source-table-id decoded))))))

    (testing "Constructs a query with a limit"
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
                                         {:query (:query construct-resp)})
            cols           (get-in execute-resp [:data :cols])
            rows           (get-in execute-resp [:data :rows])]
        (testing "response structure"
          (is (= "completed" (:status execute-resp)))
          (is (= 5 (:row_count execute-resp)))
          (is (sequential? cols))
          (is (sequential? rows))
          (is (= 5 (count rows))))
        (testing "column metadata"
          (is (seq cols) "Should have column metadata")
          (is (every? :name cols) "Each column should have a name")
          (is (every? :base_type cols) "Each column should have a base_type"))))))

(deftest get-metric-field-values-test
  (with-agent-api-setup!
    (ensure-fresh-field-values! (mt/id :orders :quantity))
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :dataset_query (orders-count-query)}]
      (testing "Returns field statistics for a field that has statistics"
        (let [metric-details (agent-client :rasta :get 200 (str "agent/v1/metric/" (:id metric)))
              quantity-field (m/find-first #(= (:name %) "QUANTITY") (:queryable_dimensions metric-details))]
          (is (some? quantity-field) "Quantity field should be in queryable_dimensions")
          (when-let [field-id (:field_id quantity-field)]
            (is (=? {:statistics map?
                     :values     sequential?}
                    (agent-client :rasta :get 200
                                  (format "agent/v1/metric/%d/field/%s/values" (:id metric) field-id)))))))

      (testing "Returns 404 for non-existent metric"
        (is (= "Not found."
               (agent-client :rasta :get 404 "agent/v1/metric/999999/field/c999999-0/values")))))))

(deftest construct-metric-query-test
  (with-agent-api-setup!
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :dataset_query (orders-count-query)}]
      (testing "Constructs a query from a metric"
        (let [response (agent-client :rasta :post 200 "agent/v1/construct-query"
                                     {:metric_id (:id metric)})]
          (is (string? (:query response)) "Response should contain a query string")
          (let [decoded (decode-query response)]
            (is (= :mbql/query (lib/normalized-query-type decoded)))
            (is (= (mt/id) (lib/database-id decoded))))))

      (testing "Returns 404 for non-existent metric"
        (is (= "No metric found with metric_id 999999"
               (agent-client :rasta :post 404 "agent/v1/construct-query"
                             {:metric_id 999999})))))))

(deftest construct-query-with-filters-test
  (with-agent-api-setup!
    (testing "Constructs a query with filters"
      (let [table-id (mt/id :orders)
            ;; Get table details to find a valid field_id
            table    (agent-client :rasta :get 200 (str "agent/v1/table/" table-id))
            field-id (-> table :fields first :field_id)
            response (agent-client :rasta :post 200 "agent/v1/construct-query"
                                   {:table_id table-id
                                    :filters  [{:field_id  field-id
                                                :operation "is-not-null"}]
                                    :limit    10})]
        (is (string? (:query response)))
        (let [decoded (decode-query response)]
          (is (seq (lib/filters decoded)) "Query should have filters"))))))

(deftest search-finds-metrics-test
  (with-agent-api-setup!
    (binding [search.ingestion/*force-sync* true]
      (search.tu/with-new-search-if-available-otherwise-legacy
        (mt/with-temp [:model/Card _metric {:name          "AgentSearchTestMetric"
                                            :type          :metric
                                            :database_id   (mt/id)
                                            :dataset_query (orders-count-query)}]
          (testing "Returns metrics in search results"
            (is (=? {:data        [{:type "metric" :name "AgentSearchTestMetric"}]
                     :total_count 1}
                    (agent-client :rasta :post 200 "agent/v1/search"
                                  {:term_queries ["AgentSearchTestMetric"]})))))))))
