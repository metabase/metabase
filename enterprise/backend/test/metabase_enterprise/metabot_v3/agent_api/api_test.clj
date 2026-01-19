(ns metabase-enterprise.metabot-v3.agent-api.api-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase-enterprise.metabot-v3.settings] ; for setting definitions
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.session.models.session :as session.models]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.random :as u.random]
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
     (mt/with-additional-premium-features #{:metabot-v3}
       ~@body)))

(defn- auth-headers
  "Create authorization headers with a signed JWT for the given email."
  ([]
   (auth-headers "rasta@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:email email}))}))

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
  (mt/test-helpers-set-global-values!
    (mt/with-additional-premium-features #{:metabot-v3}
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
                 response)))))))

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
    (mt/test-helpers-set-global-values!
      (mt/with-additional-premium-features #{:metabot-v3}
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
                                      {:request-options {:headers {"x-metabase-session" session-key}}})))))))))))

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
                (client/client :get 200 (str "agent/v1/table/" table-id)
                               {:request-options {:headers (auth-headers)}})))))

    (testing "Returns 404 for non-existent table"
      (is (= "Not found."
             (client/client :get 404 "agent/v1/table/999999"
                            {:request-options {:headers (auth-headers)}}))))

    (testing "Respects query parameters"
      (let [table-id (mt/id :orders)]
        (is (=? {:type   "table"
                 :id     table-id
                 :fields empty?}
                (client/client :get 200 (str "agent/v1/table/" table-id)
                               {:request-options {:headers (auth-headers)}}
                               :with-fields false
                               :with-related-tables false)))))))

(deftest get-metric-details-test
  (with-agent-api-setup!
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :dataset_query (mt/mbql-query orders
                                                        {:aggregation [[:count]]})}]
      (testing "Returns metric details for valid metric ID"
        (is (=? {:type                  "metric"
                 :id                    (:id metric)
                 :name                  "Test Metric"
                 :queryable_dimensions  sequential?}
                (client/client :get 200 (str "agent/v1/metric/" (:id metric))
                               {:request-options {:headers (auth-headers)}}))))

      (testing "Respects query parameters"
        (is (=? {:type "metric"
                 :id   (:id metric)}
                (client/client :get 200 (str "agent/v1/metric/" (:id metric))
                               {:request-options {:headers (auth-headers)}}
                               :with-queryable-dimensions false
                               :with-field-values false))))

      (testing "Returns 404 for non-existent metric"
        (is (= "Not found."
               (client/client :get 404 "agent/v1/metric/999999"
                              {:request-options {:headers (auth-headers)}})))))))

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
    (let [admin-headers (auth-headers "crowberto@metabase.com")]
      ;; Ensure field values exist for the field we'll test
      (ensure-fresh-field-values! (mt/id :people :state))

      (testing "Returns field statistics and values for a table field"
        (let [table-id (mt/id :people)
              field-id (visible-field-id table-id "State")]
          (is (some? field-id) "Should find the State field")
          (is (=? {:statistics {:distinct_count 49}
                   :values     sequential?}
                  (client/client :get 200 (format "agent/v1/table/%d/field/%s/values" table-id field-id)
                                 {:request-options {:headers admin-headers}})))))

      (testing "Respects limit parameter"
        (let [table-id (mt/id :people)
              field-id (visible-field-id table-id "State")
              result   (client/client :get 200 (format "agent/v1/table/%d/field/%s/values" table-id field-id)
                                      {:request-options {:headers admin-headers}}
                                      :limit 5)]
          (is (= 5 (count (:values result))) "Should respect limit parameter")))

      (testing "Returns 404 for non-existent table"
        (is (= "Not found."
               (client/client :get 404 "agent/v1/table/999999/field/t999999-0/values"
                              {:request-options {:headers admin-headers}})))))))

(deftest search-test
  (with-agent-api-setup!
    (binding [search.ingestion/*force-sync* true]
      (search.tu/with-new-search-if-available-otherwise-legacy
        (mt/with-temp [:model/Table _ {:name "AgentSearchTestTable"}]
          (testing "Returns search results for term queries"
            (is (=? {:data       [{:type "table" :name "AgentSearchTestTable"}]
                     :total_count 1}
                    (client/client :post 200 "agent/v1/search"
                                   {:request-options {:headers (auth-headers)}}
                                   {:term_queries ["AgentSearchTestTable"]})))))))))

(defn- decode-base64-url-safe
  "Decode a URL-safe base64 string back to the original string."
  [s]
  (-> s
      (str/replace "-" "+")
      (str/replace "_" "/")
      u/decode-base64))

(defn- decode-query
  "Decode a base64-encoded query response to a Clojure map."
  [response]
  (-> response :query decode-base64-url-safe json/decode+kw))

(deftest construct-query-test
  (with-agent-api-setup!
    (testing "Constructs a simple query from a table"
      (let [table-id (mt/id :orders)
            response (client/client :post 200 "agent/v1/construct-query"
                                    {:request-options {:headers (auth-headers)}}
                                    {:table_id table-id})]
        (is (string? (:query response)) "Response should contain a query string")
        (let [decoded (decode-query response)]
          (is (= "mbql/query" (:lib/type decoded)))
          (is (= (mt/id) (:database decoded)))
          (is (= (mt/id :orders) (get-in decoded [:stages 0 :source-table]))))))

    (testing "Constructs a query with a limit"
      (let [table-id (mt/id :orders)
            response (client/client :post 200 "agent/v1/construct-query"
                                    {:request-options {:headers (auth-headers)}}
                                    {:table_id table-id
                                     :limit    10})]
        (let [decoded (decode-query response)]
          (is (= 10 (get-in decoded [:stages 0 :limit]))))))

    (testing "Returns 404 for non-existent table"
      (is (= "No table found with table_id 999999"
             (client/client :post 404 "agent/v1/construct-query"
                            {:request-options {:headers (auth-headers)}}
                            {:table_id 999999}))))))

