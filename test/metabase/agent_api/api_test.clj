(ns metabase.agent-api.api-test
  "Agent API functional tests using session-based authentication.
   JWT and scope-related tests live in metabase-enterprise.agent-api.api-test."
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.agent-api.api :as agent-api.api]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
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

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- orders-count-query
  "Create a simple count query on the orders table using lib functions."
  []
  (-> (lib/query (mt/metadata-provider)
                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
      (lib/aggregate (lib/count))))

;;; ------------------------------------------------- Session Auth Tests ------------------------------------------------

(deftest agent-api-session-token-auth-test
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
             response)))))

(deftest agent-api-expired-session-test
  (testing "Expired sessions are rejected by the standard session middleware"
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
                                  {:request-options {:headers {"x-metabase-session" session-key}}})))))))))

(deftest agent-api-enabled-setting-test
  (testing "External Agent API routes return 403 when disabled"
    (mt/with-temporary-setting-values [agent-api.settings/agent-api-enabled? false]
      (is (= "Agent API is not enabled."
             (mt/user-http-request :rasta :get 403 "agent/v1/ping"))))))

(deftest ai-features-enabled-setting-test
  (testing "External Agent API routes return 403 when AI features are globally disabled"
    (mt/with-temporary-raw-setting-values [:ai-features-enabled? "false"
                                           :agent-api-enabled?   "true"]
      (is (= "AI features are not enabled."
             (mt/user-http-request :rasta :get 403 "agent/v1/ping"))))))

;;; ------------------------------------------------- Functional Tests --------------------------------------------------

(deftest get-table-details-test
  (testing "Returns table details for valid table ID"
    (let [table-id (mt/id :orders)]
      (is (=? {:type           "table"
               :id             table-id
               :name           "ORDERS"
               :display_name   "Orders"
               :database_id    (mt/id)
               :fields         sequential?
               :related_tables sequential?}
              (mt/user-http-request :rasta :get 200 (str "agent/v1/table/" table-id))))))
  (testing "Returns 404 for non-existent table"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404 "agent/v1/table/999999"))))
  (testing "Respects query parameters"
    (let [table-id (mt/id :orders)]
      (is (=? {:type   "table"
               :id     table-id
               :fields empty?}
              (mt/user-http-request :rasta :get 200
                                    (str "agent/v1/table/" table-id "?with-fields=false&with-related-tables=false"))))))
  (testing "Field values are excluded by default"
    (let [table-id (mt/id :orders)
          table    (mt/user-http-request :rasta :get 200 (str "agent/v1/table/" table-id))]
      (is (every? #(nil? (:field_values %)) (:fields table)))))
  (testing "Field values are included when explicitly requested"
    (let [table-id (mt/id :orders)
          table    (mt/user-http-request :rasta :get 200 (str "agent/v1/table/" table-id "?with-field-values=true"))]
      (is (some #(seq (:field_values %)) (:fields table))))))

(deftest get-table-details-field-types-test
  (testing "Field metadata (base_type, effective_type, semantic_type, coercion_strategy) is returned correctly"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id, :name "t", :active true}
                   :model/Field    _              {:table_id table-id, :name "id"
                                                   :base_type :type/BigInteger
                                                   :semantic_type :type/PK}
                   :model/Field    _              {:table_id table-id, :name "name"
                                                   :base_type :type/Text}
                   :model/Field    _              {:table_id table-id, :name "created_at"
                                                   :base_type :type/Text
                                                   :effective_type :type/DateTime
                                                   :coercion_strategy :Coercion/ISO8601->DateTime}]
      (let [fields  (-> (mt/user-http-request :rasta :get 200 (str "agent/v1/table/" table-id))
                        :fields)
            by-name (m/index-by :name fields)]
        (testing "base_type is always set"
          (is (= "type/BigInteger" (get-in by-name ["id" :base_type])))
          (is (= "type/Text"       (get-in by-name ["name" :base_type])))
          (is (= "type/Text"       (get-in by-name ["created_at" :base_type]))))
        (testing "semantic_type is returned when set"
          (is (= "type/PK" (get-in by-name ["id" :semantic_type])))
          (is (nil? (get-in by-name ["name" :semantic_type]))))
        (testing "effective_type and coercion_strategy are returned when coerced"
          (is (= "type/DateTime"               (get-in by-name ["created_at" :effective_type])))
          (is (= "Coercion/ISO8601->DateTime" (get-in by-name ["created_at" :coercion_strategy]))))
        (testing "effective_type is omitted when it equals base_type"
          (is (not (contains? (get by-name "id") :effective_type)))
          (is (not (contains? (get by-name "name") :effective_type))))))))

(deftest get-metric-details-test
  (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                     :type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-count-query)}]
    (testing "Returns metric details for valid metric ID"
      (is (=? {:type                 "metric"
               :id                   (:id metric)
               :name                 "Test Metric"
               :queryable_dimensions sequential?}
              (mt/user-http-request :rasta :get 200 (str "agent/v1/metric/" (:id metric))))))
    (testing "Respects query parameters"
      (is (=? {:type "metric"
               :id   (:id metric)}
              (mt/user-http-request :rasta :get 200
                                    (str "agent/v1/metric/" (:id metric)
                                         "?with-queryable-dimensions=false&with-field-values=false")))))
    (testing "Returns 404 for non-existent metric"
      (is (= "Not found."
             (mt/user-http-request :rasta :get 404 "agent/v1/metric/999999"))))))

(defn- ensure-fresh-field-values!
  "Ensure field values exist for a field by deleting any existing ones and recreating them."
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id :type :full)
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id field-id)))

(defn- visible-field-id
  "Find the real field ID for a field by display name within a table's visible columns."
  [table-id field-display-name]
  (let [mp           (mt/metadata-provider)
        query        (lib/query mp (lib.metadata/table mp table-id))
        visible-cols (lib/visible-columns query)]
    (->> visible-cols
         (filter #(= (lib/display-name query %) field-display-name))
         first
         :id)))

(deftest get-table-field-values-test
  ;; Ensure field values exist for the field we'll test
  (ensure-fresh-field-values! (mt/id :people :state))
  (testing "Returns field statistics and values with default limit of 30"
    (let [table-id (mt/id :people)
          field-id (visible-field-id table-id "State")]
      (is (some? field-id) "Should find the State field")
      (let [result (mt/user-http-request :crowberto :get 200
                                         (format "agent/v1/table/%d/field/%s/values" table-id field-id))]
        (is (=? {:value_metadata {:statistics   {:distinct-count 49}
                                  :field_values sequential?}}
                result))
        (is (<= (count (:values result)) 30) "Should apply default limit of 30"))))
  (testing "Respects explicit limit parameter"
    (let [table-id (mt/id :people)
          field-id (visible-field-id table-id "State")]
      (is (=? {:value_metadata {:field_values #(= 5 (count %))}}
              (mt/user-http-request :crowberto :get 200
                                    (format "agent/v1/table/%d/field/%s/values?limit=5" table-id field-id))))))
  (testing "Returns 404 for non-existent table"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 "agent/v1/table/999999/field/999999/values"))))
  (testing "Returns 404 for non-existent field"
    (let [table-id (mt/id :people)]
      (is (= "Field 999999 not found"
             (mt/user-http-request :crowberto :get 404 (format "agent/v1/table/%d/field/999999/values" table-id)))))))

(deftest search-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Table _ {:name "AgentSearchTestTable"}]
        (testing "Returns search results for term queries"
          (is (=? {:data        [{:type "table" :name "AgentSearchTestTable"}]
                   :total_count 1}
                  (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                        {:term_queries ["AgentSearchTestTable"]}))))))))

(deftest coerce-query-list-test
  (let [coerce #'agent-api.api/coerce-query-list]
    (testing "arrays pass through unchanged"
      (is (= ["orders" "revenue"] (coerce ["orders" "revenue"]))))
    (testing "nil stays nil"
      (is (nil? (coerce nil))))
    (testing "a bare string becomes a single-element list"
      (is (= ["orders"] (coerce "orders"))))
    (testing "a JSON-stringified array of strings is unwrapped"
      (is (= ["orders" "revenue"] (coerce "[\"orders\", \"revenue\"]"))))
    (testing "JSON arrays with non-string elements are not unwrapped — they fall back to a literal single query so that downstream :sequential NonBlankString validation is never bypassed"
      (is (= ["[1, 2]"] (coerce "[1, 2]")))
      (is (= ["[\"\"]"] (coerce "[\"\"]"))))
    (testing "non-JSON strings become a single-element list"
      (is (= ["not json ["] (coerce "not json ["))))))

(defn- decode-query
  "Decode a base64-encoded query response to a Clojure map, then normalize it so lib functions work."
  [response]
  (-> response :query u/decode-base64 json/decode+kw lib.normalize/normalize))

(deftest construct-query-test
  (testing "Constructs a simple query from a table"
    (let [table-id (mt/id :orders)
          response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:source     {:type "table" :id table-id}
                                          :operations []})]
      (is (string? (:query response)) "Response should contain a query string")
      (let [decoded (decode-query response)]
        (is (= :mbql/query (lib/normalized-query-type decoded)))
        (is (= (mt/id) (lib/database-id decoded)))
        (is (= (mt/id :orders) (lib/primary-source-table-id decoded))))))
  (testing "Respects explicit limit operation"
    (let [table-id (mt/id :orders)
          response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:source     {:type "table" :id table-id}
                                          :operations [["limit" 10]]})
          decoded  (decode-query response)]
      (is (= 10 (lib/current-limit decoded)))))
  (testing "Returns 404 for non-existent table"
    (is (= "Not found."
           (mt/user-http-request :rasta :post 404 "agent/v2/construct-query"
                                 {:source     {:type "table" :id 999999}
                                  :operations []})))))

(deftest execute-query-test
  (testing "Executes a query and returns results with column metadata"
    (let [table-id       (mt/id :orders)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id table-id}
                                                :operations [["limit" 5]]})
          ;; Streaming response returns 202 (accepted) since it starts streaming before completion
          execute-resp   (mt/user-http-request :rasta :post 202 "agent/v1/execute"
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
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id table-id}
                                                :operations [["limit" 300]]})
          execute-resp   (mt/user-http-request :rasta :post 202 "agent/v1/execute"
                                               {:query (:query construct-resp)})]
      (is (=? {:status "completed" :row_count 200}
              execute-resp))))
  (testing "Rejects native queries with 400; force callers onto /v1/execute-sql"
    ;; The scope `agent:query:execute` gates /v1/execute; `agent:sql:execute` gates
    ;; /v1/execute-sql. If /v1/execute accepted a base64 payload carrying native SQL —
    ;; at the top level or nested in a source-query/join — a token with only the broader
    ;; scope could run raw SQL, defeating the scope split.
    (doseq [[label q] [["top-level :type native"
                        {:database (mt/id) :type "native" :native {:query "select 1"}}]
                       ["nested legacy source-query"
                        {:database (mt/id) :type "query" :query {:source-query {:native "select 1"}}}]]]
      (testing label
        (is (re-find #"Native queries are not supported"
                     (str (mt/user-http-request :rasta :post 400 "agent/v1/execute"
                                                {:query (u/encode-base64 (json/encode q))}))))))))

(deftest get-metric-field-values-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                     :type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-count-query)}]
    (testing "Returns field statistics for a field that has statistics"
      (let [metric-details (mt/user-http-request :rasta :get 200 (str "agent/v1/metric/" (:id metric)))
            quantity-field (m/find-first #(= (:name %) "QUANTITY") (:queryable_dimensions metric-details))]
        (is (some? quantity-field) "Quantity field should be in queryable_dimensions")
        (when-let [field-id (:field_id quantity-field)]
          (is (=? {:value_metadata {:statistics   map?
                                    :field_values sequential?}}
                  (mt/user-http-request :rasta :get 200
                                        (format "agent/v1/metric/%d/field/%s/values" (:id metric) field-id)))))))
    (testing "Returns 404 for non-existent metric"
      (is (= "Not found."
             (mt/user-http-request :rasta :get 404 "agent/v1/metric/999999/field/999999/values"))))
    (testing "Returns 404 for non-existent field on metric"
      (is (= "Field 999999 not found"
             (mt/user-http-request :rasta :get 404 (format "agent/v1/metric/%d/field/999999/values" (:id metric))))))))

(deftest construct-metric-query-test
  (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                     :type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-count-query)}]
    (testing "Constructs a query from a metric"
      (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                           {:source     {:type "metric" :id (:id metric)}
                                            :operations []})]
        (is (string? (:query response)) "Response should contain a query string")
        (let [decoded (decode-query response)]
          (is (= :mbql/query (lib/normalized-query-type decoded)))
          (is (= (mt/id) (lib/database-id decoded))))))
    (testing "Returns 404 for non-existent metric"
      (is (= "Not found."
             (mt/user-http-request :rasta :post 404 "agent/v2/construct-query"
                                   {:source     {:type "metric" :id 999999}
                                    :operations []}))))))

(deftest construct-query-with-count-aggregation-test
  (testing "Count aggregation produces a valid query"
    (let [table-id (mt/id :orders)
          response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:source     {:type "table" :id table-id}
                                          :operations [["aggregate" ["count"]]
                                                       ["limit" 10]]})]
      (is (string? (:query response)))
      (let [decoded (decode-query response)]
        (is (= 1 (count (lib/aggregations decoded))))))))

(deftest construct-query-with-filters-test
  (testing "Constructs a query with filters"
    (let [table-id (mt/id :orders)
          field-id (mt/id :orders :id)
          response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:source     {:type "table" :id table-id}
                                          :operations [["filter" ["not-null" ["field" field-id]]]
                                                       ["limit" 10]]})]
      (is (string? (:query response)))
      (let [decoded (decode-query response)]
        (is (seq (lib/filters decoded)) "Query should have filters")))))

(deftest get-table-details-with-measures-test
  (let [measure-def (-> (lib/query (mt/metadata-provider)
                                   (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                        (lib/aggregate (lib/sum (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total)))))]
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Total Revenue"
                                                    :table_id   (mt/id :orders)
                                                    :definition measure-def}]
      (testing "with-measures=false (default) does not include measures"
        (let [table (mt/user-http-request :rasta :get 200 (str "agent/v1/table/" (mt/id :orders)))]
          (is (nil? (:measures table)))))
      (testing "with-measures=true includes measures for the table"
        (let [table (mt/user-http-request :rasta :get 200
                                          (str "agent/v1/table/" (mt/id :orders) "?with-measures=true"))]
          (is (sequential? (:measures table)))
          (is (=? [{:id   measure-id
                    :name "Total Revenue"}]
                  (:measures table))))))))

(deftest combined-query-test
  (testing "Returns results for a table query that fits in a single page"
    (let [table-id (mt/id :orders)
          field-id (visible-field-id table-id "ID")
          response (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                         {:source     {:type "table" :id table-id}
                                          :operations [["order-by" ["field" field-id]]
                                                       ["limit" 5]]})]
      (is (=? {:status             "completed"
               :row_count          5
               :continuation_token nil?
               :data               {:cols sequential?
                                    :rows (fn [rows] (= 5 (count rows)))}}
              response))))
  (testing "Continuation token returns next page of results when the total limit exceeds the page size"
    (let [table-id   (mt/id :orders)
          field-id   (visible-field-id table-id "ID")
          page-size  200
          total-rows 250
          page1      (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                           {:source     {:type "table" :id table-id}
                                            :operations [["order-by" ["field" field-id]]
                                                         ["limit" total-rows]]})
          page2      (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                           {:continuation_token (:continuation_token page1)})]
      (is (=? {:row_count          page-size
               :continuation_token string?
               :data               {:rows (fn [rows] (= page-size (count rows)))}}
              page1))
      (is (=? {:row_count          (- total-rows page-size)
               :continuation_token nil?
               :data               {:rows (fn [rows] (= (- total-rows page-size) (count rows)))}}
              page2))
      (is (not= (get-in page1 [:data :rows])
                (get-in page2 [:data :rows]))
          "Pages should return different rows")))
  (testing "No continuation_token when all rows are returned"
    (is (=? {:status             "completed"
             :continuation_token nil?}
            (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                  {:source     {:type "table" :id (mt/id :orders)}
                                   :operations [["aggregate" ["count"]]]}))))
  (testing "Per-page cap limits a single page to 200 rows even when the total limit is higher"
    (is (=? {:status    "completed"
             :row_count (fn [n] (<= n 200))}
            (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                  {:source     {:type "table" :id (mt/id :orders)}
                                   :operations [["limit" 1000]]})))))

(deftest combined-query-accepts-resolved-handle-test
  (testing "`/v2/query` executes a base64 `:query` string (a resolved query_handle) directly,
            skipping the representations pipeline"
    (let [table-id       (mt/id :orders)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id table-id}
                                                :operations [["order-by" ["field" (visible-field-id table-id "ID")]]
                                                             ["limit" 5]]})]
      (is (=? {:status             "completed"
               :row_count          5
               :continuation_token nil?
               :data               {:cols sequential?
                                    :rows (fn [rows] (= 5 (count rows)))}}
              (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                    {:query (:query construct-resp)})))))
  (testing "Pagination works on the resolved-handle path: the per-query :limit drives the
            continuation_token across pages"
    (let [page-size      200
          total-rows     250
          table-id       (mt/id :orders)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id table-id}
                                                :operations [["order-by" ["field" (visible-field-id table-id "ID")]]
                                                             ["limit" total-rows]]})
          page1          (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                               {:query (:query construct-resp)})
          page2          (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                               {:continuation_token (:continuation_token page1)})]
      (is (=? {:row_count page-size :continuation_token string?} page1))
      (is (=? {:row_count (- total-rows page-size) :continuation_token nil?} page2)))))

(deftest combined-query-rejects-native-handle-test
  (testing "`/v2/query` rejects a base64 native query with 400 — `agent:query` must not run raw SQL,
            same scope split `/v1/execute` enforces — in both the legacy and MBQL 5 native forms"
    (doseq [[label q] [["legacy top-level :type"
                        {:database (mt/id) :type "native" :native {:query "select 1"}}]
                       ["MBQL 5 native stage"
                        {:lib/type "mbql/query"
                         :stages   [{:lib/type "mbql.stage/native" :native "select 1"}]}]
                       ["MBQL 5 native stage nested in a join"
                        {:lib/type "mbql/query"
                         :stages   [{:lib/type "mbql.stage/mbql"
                                     :joins    [{:lib/type "mbql/join"
                                                 :stages   [{:lib/type "mbql.stage/native"
                                                             :native   "select 1"}]}]}]}]
                       ["legacy nested native source-query"
                        {:database (mt/id) :type "query"
                         :query    {:source-query {:native "select 1"}}}]]]
      (testing label
        (is (re-find #"Native queries are not supported"
                     (str (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                                {:query (u/encode-base64 (json/encode q))}))))))))

(deftest combined-query-rejects-malformed-payload-test
  (testing "`/v2/query` returns 400 (not 500) when a base64 `:query` isn't a valid JSON object"
    (doseq [[label q] [["not valid base64/JSON"        "@@@not-base64@@@"]
                       ["valid base64 of a non-object" (u/encode-base64 (json/encode 5))]]]
      (testing label
        (is (re-find #"Invalid request"
                     (str (mt/user-http-request :rasta :post 400 "agent/v2/query" {:query q})))))))
  (testing "`/v2/query` returns 400 (not 500) for a JSON object that isn't a serialized MBQL query"
    (doseq [[label q] [["non-sequential :stages" {:stages 1}]
                       ["missing :stages"        {:lib/type "mbql/query"}]
                       ["non-map stage"          {:stages [1]}]
                       ["malformed :type"        {:type 1 :stages 1}]]]
      (testing label
        (is (re-find #"expected a serialized MBQL query"
                     (str (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                                {:query (u/encode-base64 (json/encode q))})))))))
  (testing "`/v2/query` returns 400 (not 500) for an invalid present last-stage :limit"
    (doseq [[label limit] [["string"   "lots"]
                           ["zero"     0]
                           ["negative" -5]
                           ["boolean"  false]]]
      (testing label
        (is (re-find #":limit must be a positive integer"
                     (str (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                                {:query (u/encode-base64
                                                         (json/encode {:stages [{:limit limit}]}))})))))))
  (testing "`/v2/query` returns 400 for a malformed continuation_token"
    (is (re-find #"Invalid request"
                 (str (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                            {:continuation_token "@@@not-base64@@@"}))))))

(defn- make-continuation-token [pagination]
  (-> {:query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
       :pagination pagination}
      json/encode
      u/encode-base64))

(deftest continuation-token-validation-test
  (testing "Malformed pagination ints in a continuation token produce a 400, not a 500.
            This is robustness — the token isn't a trust boundary, since a caller can
            always issue a fresh program."
    (doseq [[label pagination] [["zero limit"         {:limit 0      :page 1}]
                                ["negative limit"     {:limit -10    :page 1}]
                                ["non-integer limit"  {:limit "lots" :page 1}]
                                ["zero page"          {:limit 200    :page 0}]
                                ["negative page"      {:limit 200    :page -1}]
                                ["non-integer page"   {:limit 200    :page "next"}]]]
      (testing label
        (mt/user-http-request :rasta :post 400 "agent/v2/query"
                              {:continuation_token (make-continuation-token pagination)})))))

(deftest combined-query-metric-test
  (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                     :type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-count-query)}]
    (testing "Returns results for a metric query"
      (is (=? {:status    "completed"
               :row_count pos?}
              (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                    {:source     {:type "metric" :id (:id metric)}
                                     :operations []}))))))

(deftest search-finds-metrics-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Card _metric {:name          "AgentSearchTestMetric"
                                          :type          :metric
                                          :database_id   (mt/id)
                                          :dataset_query (orders-count-query)}]
        (testing "Returns metrics in search results"
          (is (=? {:data        [{:type "metric" :name "AgentSearchTestMetric"}]
                   :total_count 1}
                  (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                        {:term_queries ["AgentSearchTestMetric"]}))))))))

;;; ------------------------------------------------ Create Question Tests -------------------------------------------

(deftest create-question-test
  (testing "Omitting collection_id saves to the caller's personal collection, not root"
    (let [personal-id    (:id (collection/user->personal-collection (mt/user->id :rasta)))
          personal-name  (collection/user->personal-collection-name (mt/user->id :rasta) :user)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id (mt/id :orders)}
                                                :operations [["limit" 10]]})
          create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                               {:name  "Agent Test Question"
                                                :query (:query construct-resp)})]
      (is (=? {:id              pos?
               :name            "Agent Test Question"
               :display         "table"
               :collection_id   personal-id
               :collection_path personal-name
               :description     nil}
              create-resp))
      (is (t2/exists? :model/Card :id (:id create-resp)))
      (t2/delete! :model/Card :id (:id create-resp))))
  (testing "Creates a question with optional fields"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Agent Question Collection"}]
      (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                 {:source     {:type "table" :id (mt/id :orders)}
                                                  :operations [["limit" 10]]})
            create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                                 {:name          "Agent Question With Options"
                                                  :query         (:query construct-resp)
                                                  :display       "bar"
                                                  :description   "A test question"
                                                  :collection_id coll-id})]
        (is (=? {:id              pos?
                 :name            "Agent Question With Options"
                 :display         "bar"
                 :collection_id   coll-id
                 :collection_path "Our analytics / Agent Question Collection"
                 :description     "A test question"}
                create-resp))
        (t2/delete! :model/Card :id (:id create-resp))))))

(deftest create-question-permission-checks-test
  (testing "POST /v1/question mirrors REST card-create permission checks (security regression for #74458)"
    (testing "Returns 403 when caller cannot write to the target collection"
      ;; The reported P1: a non-admin could plant a question in a collection
      ;; (e.g. an admin's personal collection) they have no write access to.
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {locked-id :id} {:name "Locked For Create-Q"}]
          ;; rasta has data perms by default in test setup, but no write on `locked-id`.
          (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                     {:source     {:type "table" :id (mt/id :orders)}
                                                      :operations [["limit" 10]]})]
            (mt/user-http-request :rasta :post 403 "agent/v1/question"
                                  {:name          "Should Not Save"
                                   :query         (:query construct-resp)
                                   :collection_id locked-id})))))
    (testing "Returns 403 when caller cannot run the proposed query"
      ;; Collection write does not imply the right to save a card whose query
      ;; references data the user cannot run.
      (mt/with-restored-data-perms!
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable For Create-Q"}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable-id)
            (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
            ;; crowberto (admin) constructs the query since rasta's data access is blocked.
            (let [construct-resp (mt/user-http-request :crowberto :post 200 "agent/v2/construct-query"
                                                       {:source     {:type "table" :id (mt/id :orders)}
                                                        :operations [["limit" 10]]})]
              (mt/user-http-request :rasta :post 403 "agent/v1/question"
                                    {:name          "Should Not Save"
                                     :query         (:query construct-resp)
                                     :collection_id writable-id}))))))))

(deftest create-question-collection-path-test
  (testing "collection_path is the full breadcrumb, mirroring the app's location"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent Coll"}
                   :model/Collection {child-id :id}  {:name "Child Coll" :location (format "/%d/" parent-id)}]
      (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                 {:source     {:type "table" :id (mt/id :orders)}
                                                  :operations [["limit" 10]]})
            create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                                 {:name          "Nested Q"
                                                  :query         (:query construct-resp)
                                                  :collection_id child-id})]
        (is (= "Our analytics / Parent Coll / Child Coll" (:collection_path create-resp)))
        (t2/delete! :model/Card :id (:id create-resp)))))
  (testing "Personal-collection subtrees breadcrumb under the owner's personal collection, not Our analytics"
    (let [personal-id    (:id (collection/user->personal-collection (mt/user->id :rasta)))
          personal-name  (collection/user->personal-collection-name (mt/user->id :rasta) :user)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:source     {:type "table" :id (mt/id :orders)}
                                                :operations [["limit" 10]]})
          create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                               {:name          "Personal Q"
                                                :query         (:query construct-resp)
                                                :collection_id personal-id})]
      (is (= personal-name (:collection_path create-resp)))
      (t2/delete! :model/Card :id (:id create-resp))))
  (testing "collection_path omits ancestors the caller can't read — no hidden-name leak"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {a-id :id} {:name "Visible Parent"}
                     :model/Collection {b-id :id} {:name "Hidden Parent" :location (format "/%d/" a-id)}
                     :model/Collection {c-id :id} {:name "Leaf Coll" :location (format "/%d/%d/" a-id b-id)}]
        ;; rasta can write the leaf and read its top ancestor, but has no access to the middle one.
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) a-id)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) c-id)
        (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                   {:source     {:type "table" :id (mt/id :orders)}
                                                    :operations [["limit" 10]]})
              create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                                   {:name          "Perm Filtered Q"
                                                    :query         (:query construct-resp)
                                                    :collection_id c-id})]
          ;; rasta can't read the root collection here either, so "Our analytics" is dropped too —
          ;; the point is that the unreadable middle parent never appears.
          (is (= "Visible Parent / Leaf Coll" (:collection_path create-resp)))
          (t2/delete! :model/Card :id (:id create-resp)))))))

;;; ----------------------------------------------- Create Dashboard Tests ------------------------------------------

(deftest create-dashboard-test
  (testing "Creates an empty dashboard, defaulting to the caller's personal collection"
    (let [personal-id   (:id (collection/user->personal-collection (mt/user->id :rasta)))
          personal-name (collection/user->personal-collection-name (mt/user->id :rasta) :user)
          resp          (mt/user-http-request :rasta :post 200 "agent/v1/dashboard"
                                              {:name "Agent Test Dashboard"})]
      (is (=? {:id              pos?
               :name            "Agent Test Dashboard"
               :collection_id   personal-id
               :collection_path personal-name
               :description     nil
               :dashcard_ids    []}
              resp))
      (t2/delete! :model/Dashboard :id (:id resp))))
  (testing "Creates a dashboard with questions"
    (mt/with-temp [:model/Card {card1-id :id} {:name          "DashQ1"
                                               :dataset_query (orders-count-query)
                                               :display       :table}
                   :model/Card {card2-id :id} {:name          "DashQ2"
                                               :dataset_query (orders-count-query)
                                               :display       :bar}]
      (let [resp (mt/user-http-request :rasta :post 200 "agent/v1/dashboard"
                                       {:name         "Dashboard With Questions"
                                        :description  "Test dashboard"
                                        :question_ids [card1-id card2-id]})]
        (is (=? {:id           pos?
                 :name         "Dashboard With Questions"
                 :description  "Test dashboard"
                 :dashcard_ids #(= 2 (count %))}
                resp))
        ;; Verify dashcards reference the correct cards and have valid positions
        (let [dashcards (t2/select :model/DashboardCard :dashboard_id (:id resp))]
          (is (= #{card1-id card2-id} (set (map :card_id dashcards))))
          (is (every? #(and (nat-int? (:col %)) (nat-int? (:row %))
                            (pos? (:size_x %)) (pos? (:size_y %)))
                      dashcards)))
        (t2/delete! :model/Dashboard :id (:id resp)))))
  (testing "Creates a dashboard in a specific collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Agent Dashboard Collection"}]
      (let [resp (mt/user-http-request :rasta :post 200 "agent/v1/dashboard"
                                       {:name          "Collection Dashboard"
                                        :collection_id coll-id})]
        (is (=? {:collection_id   coll-id
                 :collection_path "Our analytics / Agent Dashboard Collection"}
                resp))
        (t2/delete! :model/Dashboard :id (:id resp)))))
  (testing "Returns 404 when a question_id does not exist"
    (mt/user-http-request :rasta :post 404 "agent/v1/dashboard"
                          {:name         "Bad Dashboard"
                           :question_ids [999999]})))
