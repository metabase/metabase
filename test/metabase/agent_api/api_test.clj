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
              execute-resp)))))

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
