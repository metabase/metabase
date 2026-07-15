(ns metabase.agent-api.api-test
  "Agent API functional tests using session-based authentication.
   JWT and scope-related tests live in metabase-enterprise.agent-api.api-test."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.agent-api.api :as agent-api.api]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.ai-tracing.log :as ait.log]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- orders-count-query
  "Create a simple count query on the orders table using lib functions."
  []
  (-> (lib/query (mt/metadata-provider)
                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
      (lib/aggregate (lib/count))))

(defn- orders-limit-query
  "A simple unaggregated orders query with a row limit, built via lib."
  [n]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/limit n))))

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

(deftest eval-tracing-wraps-agent-api-requests-test
  (testing "with capture on, the routes wrapper opens a span recording status/response/user-id"
    (let [nodes (atom [])]
      ;; Force capture on and collect the emitted spans in-memory (redef the sink so no file is
      ;; written). The wrapper mints a fresh session per direct HTTP request.
      (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly true)
                                  ait.log/emit!                       (fn [node _session-id]
                                                                        (swap! nodes conj node)
                                                                        nil)]
        (is (= {:message "pong"} (mt/user-http-request :rasta :get 200 "agent/v1/ping")))
        (let [span (first (filter #(str/starts-with? (str (:name %)) "agent-api.") @nodes))]
          (is (some? span) "an agent-api.* span was emitted for the request")
          (is (= "agent-api.get /api/agent/v1/ping" (:name span)))
          (is (= 200 (get-in span [:attributes :http/status])))
          ;; the plain-data body is recorded (a streaming body would be omitted, not stringified)
          (is (= {:message "pong"} (get-in span [:attributes :http/response])))
          ;; +auth binds *current-user-id* inside the handler, so the respond-time record! sees rasta
          (is (= (mt/user->id :rasta) (get-in span [:attributes :http/user-id]))))))))

;;; ------------------------------------------------- Functional Tests --------------------------------------------------

(deftest search-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-appdb-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Table _ {:name "AgentSearchTestTable"}]
        (testing "Returns search results for term queries"
          (is (=? {:data        [{:type "table" :name "AgentSearchTestTable"}]
                   :total_count 1}
                  (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                        {:term_queries ["AgentSearchTestTable"]}))))))))

(deftest search-content-types-test
  (testing "search surfaces saved questions, dashboards, and collections (not just tables/metrics/models)"
    (binding [search.ingestion/*force-sync* true]
      (search.tu/with-appdb-search-if-available-otherwise-legacy
        (mt/with-temp [:model/Card      _ {:name "AgentSearchAcmeQuestion"}
                       :model/Dashboard _ {:name "AgentSearchAcmeDashboard"}
                       :model/Collection _ {:name "AgentSearchAcmeCollection"}]
          (let [results (->> (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                                   {:term_queries ["AgentSearchAcme"]})
                             :data
                             (map (juxt :name :type))
                             set)]
            (is (contains? results ["AgentSearchAcmeQuestion" "question"]))
            (is (contains? results ["AgentSearchAcmeDashboard" "dashboard"]))
            (is (contains? results ["AgentSearchAcmeCollection" "collection"]))))))))

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

;;; ---------------------------------------- Repr JSON helpers ----------------------------------------

(defn- db-name
  "Canonical name of the application database \u2014 the literal string the LLM is expected
  to put as the first element of every portable FK in a representations query."
  []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- orders-query
  "Build a portable MBQL 5 representations external-query map against the `ORDERS` table in
  the application database. Clause arguments (`aggregation`, `breakout`, `filters`, `order-by`,
  `fields`) are Clojure data fed straight through to the HTTP body, e.g.

      (orders-query :limit 10)
      (orders-query :aggregation [[\"count\" {}]])
      (orders-query :filters     [[\"not-null\" {} (orders-field-ref \"ID\")]])

  Structural validation against `::lib.schema/external-query` lives on the server side; here
  we just need a believable payload to drive the HTTP endpoint."
  [& {:keys [limit aggregation breakout filters order-by fields]}]
  {:lib/type "mbql/query"
   :stages   [(cond-> {:lib/type     "mbql.stage/mbql"
                       :source-table [(db-name) "PUBLIC" "ORDERS"]}
                aggregation (assoc :aggregation (vec aggregation))
                breakout    (assoc :breakout    (vec breakout))
                filters     (assoc :filters     (vec filters))
                order-by    (assoc :order-by    (vec order-by))
                fields      (assoc :fields      (vec fields))
                limit       (assoc :limit       limit))]})

(defn- orders-field-ref
  "Field-ref clause against an ORDERS column as Clojure data, e.g.
  `[\"field\" {} [\"test-data (h2)\" \"PUBLIC\" \"ORDERS\" \"ID\"]]`. Suitable as an inner
  argument inside `aggregation` / `filters` / `order-by` clauses passed to [[orders-query]]."
  [col-name]
  ["field" {} [(db-name) "PUBLIC" "ORDERS" col-name]])

(defn- source-card-query
  "Build a minimal portable representations external-query map whose first stage uses
  `source-card:`."
  [entity-id]
  {:lib/type "mbql/query"
   :stages   [{:lib/type    "mbql.stage/mbql"
               :source-card entity-id
               :limit       5}]})

;;; ---------------------------------------- /v2/construct-query ----------------------------------------

(deftest construct-query-test
  (testing "Constructs a simple query from a table"
    (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:query (orders-query)})]
      (is (string? (:query response)) "Response should contain a query string")
      (let [decoded (decode-query response)]
        (is (= :mbql/query (lib/normalized-query-type decoded)))
        (is (= (mt/id) (lib/database-id decoded)))
        (is (= (mt/id :orders) (lib/primary-source-table-id decoded))))))
  (testing "Respects explicit limit on the stage"
    (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:query (orders-query :limit 10)})
          decoded  (decode-query response)]
      (is (= 10 (lib/current-limit decoded)))))
  (testing "Returns 400 with `:unknown-table` ex-data for an unknown table FK"
    ;; Note: the new repr contract surfaces unknown-input errors as 400 (`:agent-error?`)
    ;; rather than the old 404 — the LLM is expected to read the message and self-correct.
    ;; ex-data values are stringified by the JSON roundtrip, so we match the keyword's name.
    (let [response (mt/user-http-request :rasta :post 400 "agent/v2/construct-query"
                                         {:query {:lib/type "mbql/query"
                                                  :stages   [{:lib/type     "mbql.stage/mbql"
                                                              :source-table [(db-name) "PUBLIC" "NOT_A_TABLE"]}]}})]
      (is (=? {:error "unknown-table"} response))))
  (testing "Rejects a non-aggregation in the aggregation slot with a 400"
    ;; The endpoint's wire schema is intentionally permissive (`:query :map`); deep
    ;; validation happens inside the representations pipeline. A `field` clause where an
    ;; aggregation clause is expected is caught by the E1 friendly-error pass and surfaced
    ;; as `:aggregation-entry-not-aggregation` with `:agent-error? true`, so the LLM gets
    ;; a clean diagnostic instead of a generic schema error.
    (let [response (mt/user-http-request :rasta :post 400 "agent/v2/construct-query"
                                         {:query (orders-query
                                                  :aggregation [(orders-field-ref "ID")])})]
      (is (=? {:error "aggregation-entry-not-aggregation"} response)))))

(deftest construct-query-permission-checks-test
  (testing "Rejects a first-stage source-table the current user cannot query"
    (mt/with-no-data-perms-for-all-users!
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "agent/v2/construct-query"
                                   {:query (orders-query :aggregation [["count" {}]])})))))
  (testing "Rejects a first-stage source-card the current user cannot read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Collection _collection {}
                       :model/Card       card        {:name          "Protected Question"
                                                      :collection_id (:id _collection)
                                                      :database_id   (mt/id)
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "agent/v2/construct-query"
                                       {:query (source-card-query (:entity_id card))})))))))
  (testing "Rejects a metric aggregation the current user cannot read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection _collection {}
                     :model/Card       metric      {:name          "Protected Metric"
                                                    :type          :metric
                                                    :collection_id (:id _collection)
                                                    :database_id   (mt/id)
                                                    :dataset_query (orders-count-query)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "agent/v2/construct-query"
                                     {:query (orders-query
                                              :aggregation [["metric" {} (:entity_id metric)]])})))))))

(deftest construct-query-rejects-empty-query-test
  (testing "Empty / blank :query is rejected by the request schema"
    (mt/user-http-request :rasta :post 400 "agent/v2/construct-query" {:query ""}))
  (testing "Missing :query in body is rejected by the request schema"
    (mt/user-http-request :rasta :post 400 "agent/v2/construct-query" {})))

(deftest construct-query-rejects-typod-stage-keys-test
  (testing (str "The agent boundary asserts every stage's top-level keys are in a known set. "
                "`lib.schema.mbql-stage/mbql` is not a closed map, so typo'd stage keys "
                "(e.g. `aggreagation` for `aggregation`) would otherwise be silently dropped "
                "at resolve time and the LLM would never learn that its intent was discarded.")
    (testing "typo'd `aggreagation` is rejected with :unknown-stage-key"
      (let [response (mt/user-http-request
                      :rasta :post 400 "agent/v2/construct-query"
                      {:query {:lib/type "mbql/query"
                               :stages   [{:lib/type      "mbql.stage/mbql"
                                           :source-table  [(db-name) "PUBLIC" "ORDERS"]
                                           :aggreagation  [["count" {}]]}]}})]
        (is (=? {:error "unknown-stage-key"} response))
        (is (=? {:unknown-keys ["aggreagation"]} response))))
    (testing "diagnostic lists the valid stage keys so the LLM can self-correct"
      (let [response (mt/user-http-request
                      :rasta :post 400 "agent/v2/construct-query"
                      {:query {:lib/type "mbql/query"
                               :stages   [{:lib/type     "mbql.stage/mbql"
                                           :source-table [(db-name) "PUBLIC" "ORDERS"]
                                           :groupby      ["foo"]}]}})]
        (is (=? {:error "unknown-stage-key"} response))
        (is (re-find #"aggregation" (:message response)))))))

(deftest construct-query-rejects-legacy-envelope-test
  (testing (str "Legacy `source_entity` / `referenced_entities` envelope from the pre-repr program API "
                "is rejected by the now-closed request schema, instead of being silently ignored. "
                "This guards against a regression where the LLM's stale memory keeps sending the old "
                "shape and we silently drop the extra keys.")
    (is (=? {:specific-errors {:source_entity #(some (fn [s] (re-find #"disallowed key" s)) %)}}
            (mt/user-http-request :rasta :post 400 "agent/v2/construct-query"
                                  {:query          (orders-query)
                                   :source_entity  {:type "table" :id (mt/id :orders)}}))))
  (testing "`/v2/query` fresh-query branch rejects the legacy envelope as well"
    (is (=? {:specific-errors {:referenced_entities #(some (fn [s] (re-find #"disallowed key" s)) %)}}
            (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                  {:query               (orders-query :limit 5)
                                   :referenced_entities []}))))
  (testing "`/v2/query` continuation_token branch rejects extra keys (closed schema)"
    (is (=? {:specific-errors {:query #(some (fn [s] (re-find #"disallowed key" s)) %)}}
            (mt/user-http-request :rasta :post 400 "agent/v2/query"
                                  {:continuation_token "not-a-real-token"
                                   :query               (orders-query :limit 5)})))))

(deftest execute-query-test
  (testing "Executes a query and returns results with column metadata"
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :limit 5)})
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
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :limit 300)})
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

(deftest construct-metric-query-test
  (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                     :type          :metric
                                     :database_id   (mt/id)
                                     :dataset_query (orders-count-query)}]
    (testing "Constructs a query that references a metric by entity_id in an aggregation"
      (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                           {:query (orders-query
                                                    :aggregation [["metric" {} (:entity_id metric)]])})]
        (is (string? (:query response)) "Response should contain a query string")
        (let [decoded (decode-query response)]
          (is (= :mbql/query (lib/normalized-query-type decoded)))
          (is (= (mt/id) (lib/database-id decoded)))
          (is (= 1 (count (lib/aggregations decoded)))))))
    (testing "Returns 400 with `:unknown-card` ex-data for an unknown metric entity_id"
      ;; The entity_id must be a syntactically-valid 21-char NanoID for the resolver to
      ;; even attempt the lookup; otherwise the metric clause's literal string survives to
      ;; lib.schema validation and we get a different (less useful) error class. Pick a
      ;; well-formed but absent eid to drive the `:unknown-card` path specifically.
      (let [response (mt/user-http-request :rasta :post 400 "agent/v2/construct-query"
                                           {:query (orders-query
                                                    :aggregation [["metric" {} "AAAAAAAAAAAAAAAAAAAAA"]])})]
        (is (=? {:error "unknown-card"} response))))))

(deftest construct-query-with-count-aggregation-test
  (testing "Count aggregation produces a valid query"
    (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:query (orders-query :aggregation [["count" {}]]
                                                               :limit 10)})]
      (is (string? (:query response)))
      (let [decoded (decode-query response)]
        (is (= 1 (count (lib/aggregations decoded))))))))

(deftest construct-query-with-filters-test
  (testing "Constructs a query with filters"
    (let [response (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                         {:query (orders-query
                                                  :filters [["not-null" {} (orders-field-ref "ID")]]
                                                  :limit   10)})]
      (is (string? (:query response)))
      (let [decoded (decode-query response)]
        (is (seq (lib/filters decoded)) "Query should have filters")))))

(deftest combined-query-test
  (testing "Returns results for a table query that fits in a single page"
    (let [response (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                         {:query (orders-query :order-by [["asc" {} (orders-field-ref "ID")]]
                                                               :limit    5)})]
      (is (=? {:status             "completed"
               :row_count          5
               :continuation_token nil?
               :data               {:cols sequential?
                                    :rows (fn [rows] (= 5 (count rows)))}}
              response))))
  (testing "Continuation token returns next page of results when the total limit exceeds the page size"
    (let [page-size  200
          total-rows 250
          page1      (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                           {:query (orders-query :order-by [["asc" {} (orders-field-ref "ID")]]
                                                                 :limit    total-rows)})
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
                                  {:query (orders-query :aggregation [["count" {}]])}))))
  (testing "Per-page cap limits a single page to 200 rows even when the total limit is higher"
    (is (=? {:status    "completed"
             :row_count (fn [n] (<= n 200))}
            (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                  {:query (orders-query :limit 1000)}))))
  (testing "No explicit :limit defaults to a 2000-row budget, emitting a continuation token for large tables"
    ;; Regression: previously the default budget equalled the page size (both 200), so the first
    ;; page exhausted the budget and no continuation token was ever emitted, causing agents to
    ;; report a false \"200-row hard cap\". The default budget is now 2000.
    (let [page1 (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                      {:query (orders-query :order-by [["asc" {} (orders-field-ref "ID")]])})]
      (is (=? {:status             "completed"
               :row_count          200
               :continuation_token string?}
              page1)
          "first page should include a continuation token when more data exists within the 2000-row budget")
      (is (=? {:status "completed"
               :data   {:rows sequential?}}
              (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                    {:continuation_token (:continuation_token page1)}))
          "continuation token should successfully fetch the next page"))))

(deftest combined-query-accepts-resolved-handle-test
  (testing "`/v2/query` executes a base64 `:query` string (a resolved query_handle) directly,
            skipping the representations pipeline"
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query
                                                        :order-by [["asc" {} (orders-field-ref "ID")]]
                                                        :limit    5)})]
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
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query
                                                        :order-by [["asc" {} (orders-field-ref "ID")]]
                                                        :limit    total-rows)})
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
    (testing "Returns results for a query that aggregates via a metric reference"
      (is (=? {:status    "completed"
               :row_count pos?}
              (mt/user-http-request :rasta :post 202 "agent/v2/query"
                                    {:query (orders-query
                                             :aggregation [["metric" {} (:entity_id metric)]])}))))))

(deftest search-finds-metrics-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-appdb-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Card _metric {:name          "AgentSearchTestMetric"
                                          :type          :metric
                                          :database_id   (mt/id)
                                          :dataset_query (orders-count-query)}]
        (testing "Returns metrics in search results"
          (is (=? {:data        [{:type "metric" :name "AgentSearchTestMetric"}]
                   :total_count 1}
                  (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                        {:term_queries ["AgentSearchTestMetric"]}))))))))

(deftest search-finds-models-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-appdb-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Card _model {:name          "AgentSearchTestModel"
                                         :type          :model
                                         :database_id   (mt/id)
                                         :dataset_query (orders-count-query)}]
        (testing "Returns models in search results"
          (is (=? {:data        [{:type "model" :name "AgentSearchTestModel"}]
                   :total_count 1}
                  (mt/user-http-request :rasta :post 200 "agent/v1/search"
                                        {:term_queries ["AgentSearchTestModel"]}))))))))

;;; ------------------------------------------------ Create Question Tests -------------------------------------------

(deftest create-question-test
  (testing "Omitting collection_id saves to the caller's personal collection, not root"
    (let [personal-id    (:id (collection/user->personal-collection (mt/user->id :rasta)))
          personal-name  (collection/user->personal-collection-name (mt/user->id :rasta) :user)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :limit 10)})
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
                                                 {:query (orders-query :limit 10)})
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
        (t2/delete! :model/Card :id (:id create-resp)))))
  (testing "Returns 403 when caller cannot run the proposed query"
    ;; Mirrors retro's data-perms-bypass repro: collection write does not imply the right
    ;; to save a card whose query references data the user cannot run.
    (mt/with-restored-data-perms!
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable For Create-Q"}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable-id)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
          (let [construct-resp (mt/user-http-request :crowberto :post 200 "agent/v2/construct-query"
                                                     {:query (orders-query :limit 10)})]
            (mt/user-http-request :rasta :post 403 "agent/v1/question"
                                  {:name          "Should Not Save"
                                   :query         (:query construct-resp)
                                   :collection_id writable-id}))))))
  (testing "Returns 403 when caller cannot write to target collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {locked-id :id} {:name "Locked For Create-Q"}]
        ;; rasta has data perms by default in test setup, but no write on `locked-id`.
        (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                   {:query (orders-query :limit 10)})]
          (mt/user-http-request :rasta :post 403 "agent/v1/question"
                                {:name          "Should Not Save"
                                 :query         (:query construct-resp)
                                 :collection_id locked-id}))))))

;;; ----------------------------------------- Construct / Save Native Query ------------------------------------------

(deftest construct-native-query-test
  (testing "Wraps SQL into a base64-encoded MBQL 5 native query (same shape as /v2/construct-query output)"
    (let [resp    (mt/user-http-request :crowberto :post 200 "agent/v1/construct-native-query"
                                        {:database_id (mt/id)
                                         :sql         "SELECT 1 AS n"})
          decoded (-> resp :query u/decode-base64 json/decode+kw)]
      (is (=? {:database (mt/id)
               :lib/type "mbql/query"
               :stages   [{:lib/type "mbql.stage/native" :native "SELECT 1 AS n"}]}
              decoded))))
  (testing "Returns 403 when the caller cannot access the target database"
    (mt/with-no-data-perms-for-all-users!
      (mt/user-http-request :rasta :post 403 "agent/v1/construct-native-query"
                            {:database_id (mt/id)
                             :sql         "SELECT 1"})))
  (testing "Returns 404 for a non-existent database"
    (mt/user-http-request :crowberto :post 404 "agent/v1/construct-native-query"
                          {:database_id Integer/MAX_VALUE
                           :sql         "SELECT 1"})))

(deftest create-native-question-test
  (testing "Saves a native SQL query (from construct_native_query) as a question"
    (let [construct-resp (mt/user-http-request :crowberto :post 200 "agent/v1/construct-native-query"
                                               {:database_id (mt/id)
                                                :sql         "SELECT 1 AS n"})
          create-resp    (mt/user-http-request :crowberto :post 200 "agent/v1/question"
                                               {:name  "Native Agent Question"
                                                :query (:query construct-resp)})]
      (is (=? {:id pos? :name "Native Agent Question" :display "table"} create-resp))
      (let [card (t2/select-one :model/Card :id (:id create-resp))]
        (is (= :native (:query_type card)))
        (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1 AS n"}]}
                (:dataset_query card))))
      (t2/delete! :model/Card :id (:id create-resp))))
  (testing "Returns 403 when the caller lacks native-query permission"
    (let [construct-resp (mt/user-http-request :crowberto :post 200 "agent/v1/construct-native-query"
                                               {:database_id (mt/id)
                                                :sql         "SELECT 1 AS n"})]
      (mt/with-no-data-perms-for-all-users!
        (mt/user-http-request :rasta :post 403 "agent/v1/question"
                              {:name  "Should Not Save Native"
                               :query (:query construct-resp)})))))

;;; ----------------------------------------------- Execute Question ------------------------------------------------

(deftest execute-question-test
  (testing "Runs a saved question and returns rows + column metadata"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (orders-limit-query 5)}]
      ;; Streaming response returns 202 (accepted) like the other execute endpoints.
      (let [resp (mt/user-http-request :crowberto :post 202 (format "agent/v1/question/%d/query" card-id))]
        (is (=? {:status    "completed"
                 :row_count 5
                 :data      {:cols (fn [cols] (and (seq cols) (every? :name cols) (every? :base_type cols)))
                             :rows (fn [rows] (= 5 (count rows)))}}
                resp)))))
  (testing "Returns 404 for a non-existent card"
    (mt/user-http-request :crowberto :post 404
                          (format "agent/v1/question/%d/query" Integer/MAX_VALUE)))
  (testing "Returns 403 when the caller lacks read permission on the card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {:name "No-Read Coll"}
                     :model/Card       {card-id :id} {:collection_id coll-id
                                                      :dataset_query (orders-limit-query 5)}]
        (mt/user-http-request :rasta :post 403
                              (format "agent/v1/question/%d/query" card-id))))))

(deftest execute-question-rejects-parameterized-test
  (testing "Refuses a card with a native template-tag variable (400)"
    (mt/with-temp [:model/Card {card-id :id}
                   {:dataset_query {:database (mt/id)
                                    :type     :native
                                    :native   {:query         "SELECT {{n}} AS n"
                                               :template-tags {:n {:id "n" :name "n"
                                                                   :display-name "N" :type :number}}}}}]
      (is (re-find #"takes parameters"
                   (str (mt/user-http-request :crowberto :post 400
                                              (format "agent/v1/question/%d/query" card-id)))))))
  (testing "Refuses a card with a configured parameter widget (400)"
    (mt/with-temp [:model/Card {card-id :id}
                   {:dataset_query (orders-limit-query 5)
                    :parameters    [{:id "p1" :name "Category" :slug "category" :type :category}]}]
      (is (re-find #"takes parameters"
                   (str (mt/user-http-request :crowberto :post 400
                                              (format "agent/v1/question/%d/query" card-id)))))))
  (testing "Read-check runs before the parameterized rejection, so an unreadable parameterized card is 403 — it does not leak that the card exists or is parameterized"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {:name "No-Read Coll"}
                     :model/Card       {card-id :id} {:collection_id coll-id
                                                      :dataset_query (orders-limit-query 5)
                                                      :parameters    [{:id "p1" :name "Category" :slug "category" :type :category}]}]
        (mt/user-http-request :rasta :post 403
                              (format "agent/v1/question/%d/query" card-id))))))

(deftest create-question-explicit-null-collection-test
  (testing "An explicit null collection_id saves to the root collection, not the personal default"
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :limit 10)})
          create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                               {:name          "Agent Root Question"
                                                :query         (:query construct-resp)
                                                :collection_id nil})]
      (is (=? {:collection_id   nil
               :collection_path "Our analytics"}
              create-resp))
      (t2/delete! :model/Card :id (:id create-resp)))))

(deftest create-question-collection-path-test
  (testing "collection_path is the full breadcrumb, mirroring the app's location"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent Coll"}
                   :model/Collection {child-id :id}  {:name "Child Coll" :location (format "/%d/" parent-id)}]
      (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                 {:query (orders-query :limit 10)})
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
                                               {:query (orders-query :limit 10)})
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
                                                   {:query (orders-query :limit 10)})
              create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                                   {:name          "Perm Filtered Q"
                                                    :query         (:query construct-resp)
                                                    :collection_id c-id})]
          ;; rasta can't read the root collection here either, so "Our analytics" is dropped too —
          ;; the point is that the unreadable middle parent never appears.
          (is (= "Visible Parent / Leaf Coll" (:collection_path create-resp)))
          (t2/delete! :model/Card :id (:id create-resp)))))))

;;; ------------------------------------------------ Create Metric Tests --------------------------------------------

(deftest create-metric-test
  (testing "Omitting collection_id saves a metric to the caller's personal collection, not root"
    (let [personal-id    (:id (collection/user->personal-collection (mt/user->id :rasta)))
          personal-name  (collection/user->personal-collection-name (mt/user->id :rasta) :user)
          construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :aggregation [["count" {}]])})
          create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/metric"
                                               {:name  "Agent Test Metric"
                                                :query (:query construct-resp)})]
      (is (=? {:id              pos?
               :name            "Agent Test Metric"
               :display         "scalar"
               :collection_id   personal-id
               :collection_path personal-name
               :description     nil}
              create-resp))
      (is (=? {:type :metric} (t2/select-one :model/Card :id (:id create-resp))))
      (t2/delete! :model/Card :id (:id create-resp))))
  (testing "Creates a metric with optional fields"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Agent Metric Collection"}]
      (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                 {:query (orders-query :aggregation [["count" {}]])})
            create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/metric"
                                                 {:name          "Agent Metric With Options"
                                                  :query         (:query construct-resp)
                                                  :display       "line"
                                                  :description   "A test metric"
                                                  :collection_id coll-id})]
        (is (=? {:id              pos?
                 :name            "Agent Metric With Options"
                 :display         "line"
                 :collection_id   coll-id
                 :collection_path "Our analytics / Agent Metric Collection"
                 :description     "A test metric"}
                create-resp))
        (t2/delete! :model/Card :id (:id create-resp))))))

(deftest create-metric-rejects-invalid-metric-test
  (testing "Returns 400 when the query is not a valid metric (no aggregation)"
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :limit 10)})]
      (is (str/includes?
           (mt/user-http-request :rasta :post 400 "agent/v1/metric"
                                 {:name  "Not A Metric"
                                  :query (:query construct-resp)})
           "metric")))))

(deftest create-metric-permission-checks-test
  (testing "Returns 403 when caller cannot run the proposed query"
    (mt/with-restored-data-perms!
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable For Create-Metric"}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable-id)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
          (let [construct-resp (mt/user-http-request :crowberto :post 200 "agent/v2/construct-query"
                                                     {:query (orders-query :aggregation [["count" {}]])})]
            (mt/user-http-request :rasta :post 403 "agent/v1/metric"
                                  {:name          "Should Not Save"
                                   :query         (:query construct-resp)
                                   :collection_id writable-id}))))))
  (testing "Returns 403 when caller cannot write to target collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {locked-id :id} {:name "Locked For Create-Metric"}]
        (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                                   {:query (orders-query :aggregation [["count" {}]])})]
          (mt/user-http-request :rasta :post 403 "agent/v1/metric"
                                {:name          "Should Not Save"
                                 :query         (:query construct-resp)
                                 :collection_id locked-id}))))))

(deftest create-metric-explicit-null-collection-test
  (testing "An explicit null collection_id saves the metric to the root collection, not the personal default"
    (let [construct-resp (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query (orders-query :aggregation [["count" {}]])})
          create-resp    (mt/user-http-request :rasta :post 200 "agent/v1/metric"
                                               {:name          "Agent Root Metric"
                                                :query         (:query construct-resp)
                                                :collection_id nil})]
      (is (=? {:collection_id   nil
               :collection_path "Our analytics"}
              create-resp))
      (t2/delete! :model/Card :id (:id create-resp)))))

;;; ------------------------------------------------ Update Metric Tests --------------------------------------------

(deftest update-metric-patch-fields-test
  (testing "Patches simple fields (name, description) on a metric"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Agent Update Metric Original"
                                              :type          :metric
                                              :dataset_query (orders-count-query)
                                              :display       :scalar}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/metric/" card-id)
                                       {:name        "Renamed Metric"
                                        :description "Set by agent"})]
        (is (=? {:id          card-id
                 :name        "Renamed Metric"
                 :description "Set by agent"
                 :archived    false}
                resp)))
      (is (= "Renamed Metric" (t2/select-one-fn :name :model/Card :id card-id))))))

(deftest update-metric-move-test
  (testing "Moving a metric sets collection_id"
    (mt/with-temp [:model/Collection {dest-coll-id :id} {:name "Agent Metric Move Dest"}
                   :model/Card       {card-id :id}      {:name          "Metric To Move"
                                                         :type          :metric
                                                         :dataset_query (orders-count-query)
                                                         :display       :scalar}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/metric/" card-id)
                                       {:collection_id dest-coll-id})]
        (is (=? {:collection_id   dest-coll-id
                 :collection_path "Our analytics / Agent Metric Move Dest"}
                resp)))
      (is (= dest-coll-id (t2/select-one-fn :collection_id :model/Card :id card-id))))))

(deftest update-metric-archive-test
  (testing "Archiving a metric also sets :archived_directly so it lands in the Trash"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Metric To Archive"
                                              :type          :metric
                                              :dataset_query (orders-count-query)
                                              :display       :scalar}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/metric/" card-id)
                                       {:archived true})]
        (is (true? (:archived resp))))
      (is (true? (t2/select-one-fn :archived :model/Card :id card-id)))
      (is (true? (t2/select-one-fn :archived_directly :model/Card :id card-id)))
      (testing "archival is a soft delete: archived: false reverses it"
        (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/metric/" card-id)
                                         {:archived false})]
          (is (false? (:archived resp))))
        (is (false? (t2/select-one-fn :archived :model/Card :id card-id)))
        (is (false? (t2/select-one-fn :archived_directly :model/Card :id card-id)))))))

(deftest update-metric-replace-query-test
  (testing "Replacing the underlying query via :query keeps a valid metric"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Metric To Re-query"
                                              :type          :metric
                                              :dataset_query (orders-count-query)
                                              :display       :scalar}]
      (let [products-id  (mt/id :products)
            construct    (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query {:lib/type "mbql/query"
                                                        :stages   [{:lib/type     "mbql.stage/mbql"
                                                                    :source-table [(db-name) "PUBLIC" "PRODUCTS"]
                                                                    :aggregation  [["count" {}]]}]}})
            _resp        (mt/user-http-request :rasta :put 200 (str "agent/v1/metric/" card-id)
                                               {:query (:query construct)})
            persisted    (t2/select-one-fn :dataset_query :model/Card :id card-id)
            source-table (some :source-table (:stages persisted))]
        (is (some? persisted))
        (is (= products-id source-table)
            (str "Expected persisted dataset_query :source-table to be the products table id "
                 products-id ", got " source-table))))))

(deftest update-metric-rejects-non-metric-query-test
  (testing "Returns 400 when a replacement query is not a valid metric (no aggregation)"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Metric With Bad Requery"
                                              :type          :metric
                                              :dataset_query (orders-count-query)
                                              :display       :scalar}]
      (let [construct (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                            {:query (orders-query :limit 5)})]
        (is (str/includes?
             (mt/user-http-request :rasta :put 400 (str "agent/v1/metric/" card-id)
                                   {:query (:query construct)})
             "metric"))
        ;; query untouched after the rejected update — still the original count aggregation
        (is (seq (:aggregation (first (:stages (t2/select-one-fn :dataset_query :model/Card :id card-id))))))))))

(deftest update-metric-rejects-non-metric-card-test
  (testing "Returns 400 when the target card is not a metric"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Just A Question"
                                              :type          :question
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (is (str/includes?
           (mt/user-http-request :rasta :put 400 (str "agent/v1/metric/" card-id)
                                 {:name "Rename Attempt"})
           "not a metric")))))

(deftest update-metric-not-found-test
  (testing "Returns 404 when metric does not exist"
    (mt/user-http-request :rasta :put 404 "agent/v1/metric/999999"
                          {:name "doesn't matter"})))

(deftest update-metric-write-perm-test
  (testing "Returns 403 when caller lacks write access on the metric"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {locked-coll-id :id} {:name "Locked Metric Coll"}
                     :model/Card       {card-id :id}        {:name          "Hidden Metric"
                                                             :type          :metric
                                                             :dataset_query (orders-count-query)
                                                             :display       :scalar
                                                             :collection_id locked-coll-id}]
        (mt/user-http-request :rasta :put 403 (str "agent/v1/metric/" card-id)
                              {:name "Forbidden Rename"})))))

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

(deftest create-dashboard-explicit-null-collection-test
  (testing "An explicit null collection_id saves to the root collection, not the personal default"
    (let [resp (mt/user-http-request :rasta :post 200 "agent/v1/dashboard"
                                     {:name          "Agent Root Dashboard"
                                      :collection_id nil})]
      (is (=? {:collection_id   nil
               :collection_path "Our analytics"}
              resp))
      (t2/delete! :model/Dashboard :id (:id resp)))))

(deftest create-entity-url-test
  (testing "create question/dashboard return a frontend URL"
    (testing "absolute when site-url is set"
      (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
        (let [construct (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                              {:query (orders-query :limit 1)})
              q         (mt/user-http-request :rasta :post 200 "agent/v1/question"
                                              {:name "URL Q" :query (:query construct)})
              d         (mt/user-http-request :rasta :post 200 "agent/v1/dashboard" {:name "URL D"})]
          (is (= (str "https://mb.example.com/question/" (:id q)) (:url q)))
          (is (= (str "https://mb.example.com/dashboard/" (:id d)) (:url d)))
          (t2/delete! :model/Card :id (:id q))
          (t2/delete! :model/Dashboard :id (:id d)))))
    (testing "relative when site-url is unset (no \"null\" prefix)"
      (mt/with-temporary-setting-values [site-url nil]
        (let [d (mt/user-http-request :rasta :post 200 "agent/v1/dashboard" {:name "Relative URL D"})]
          (is (= (str "/dashboard/" (:id d)) (:url d)))
          (t2/delete! :model/Dashboard :id (:id d)))))))

(deftest create-collection-test
  (testing "Creates a root-level collection"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [resp (mt/user-http-request :crowberto :post 200 "agent/v1/collection"
                                       {:name "Agent Root Coll"})]
        (is (=? {:id          pos?
                 :name        "Agent Root Coll"
                 :parent_id   nil
                 :location    "/"
                 :description nil}
                resp))
        (t2/delete! :model/Collection :id (:id resp)))))
  (testing "Creates a nested collection under a parent"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Agent Parent Coll"}]
      (let [resp (mt/user-http-request :crowberto :post 200 "agent/v1/collection"
                                       {:name                 "Agent Nested Coll"
                                        :description          "Nested under parent"
                                        :parent_collection_id parent-id})]
        (is (=? {:id          pos?
                 :name        "Agent Nested Coll"
                 :parent_id   parent-id
                 :description "Nested under parent"}
                resp))
        ;; location should encode the parent's id in the materialized path
        (is (= (str "/" parent-id "/") (:location resp)))
        (t2/delete! :model/Collection :id (:id resp)))))
  (testing "Returns 404 when parent_collection_id does not exist"
    (mt/user-http-request :crowberto :post 404 "agent/v1/collection"
                          {:name                 "Bad Parent Coll"
                           :parent_collection_id 999999}))
  (testing "Returns 403 when caller lacks write access on the parent"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {parent-id :id} {:name "Locked Parent"}]
        ;; Non-admin groups have no perms on the new collection by default.
        (mt/user-http-request :rasta :post 403 "agent/v1/collection"
                              {:name                 "Should Fail"
                               :parent_collection_id parent-id}))))
  ;; Parent-inheritance behaviors (:namespace, :type "library*", :is_remote_synced, exclusion of
  ;; :type "trash") are unit-tested directly against `apply-defaults-to-collection` in
  ;; `metabase.collections.create-test`, since the HTTP boundary is gated by other checks
  ;; (library collections refuse writes, snippet-namespace collections require explicit perms)
  ;; that make end-to-end coverage redundant.
  )

;;; ----------------------------------------------- Update Question Tests ------------------------------------------

(deftest update-question-patch-fields-test
  (testing "Patches simple fields (name, description, archived)"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Agent Update Q Original"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/question/" card-id)
                                       {:name        "Renamed by Agent"
                                        :description "Set by agent"})]
        (is (=? {:id          card-id
                 :name        "Renamed by Agent"
                 :description "Set by agent"
                 :archived    false}
                resp)))
      ;; verify persisted
      (is (= "Renamed by Agent" (t2/select-one-fn :name :model/Card :id card-id)))
      (is (= "Set by agent" (t2/select-one-fn :description :model/Card :id card-id))))))

(deftest update-question-move-test
  (testing "Moving a card sets collection_id (subsumes move_card)"
    (mt/with-temp [:model/Collection {dest-coll-id :id} {:name "Agent Move Dest"}
                   :model/Card       {card-id :id}      {:name          "Card To Move"
                                                         :dataset_query (orders-count-query)
                                                         :display       :table}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/question/" card-id)
                                       {:collection_id dest-coll-id})]
        (is (=? {:collection_id   dest-coll-id
                 :collection_path "Our analytics / Agent Move Dest"}
                resp)))
      (is (= dest-coll-id (t2/select-one-fn :collection_id :model/Card :id card-id))))))

(deftest update-question-archive-test
  (testing "Archiving a card also sets :archived_directly so it lands in the Trash"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card To Archive"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/question/" card-id)
                                       {:archived true})]
        (is (true? (:archived resp))))
      (is (true? (t2/select-one-fn :archived :model/Card :id card-id)))
      ;; Mirrors the REST archive flow -- without :archived_directly the card would only show up
      ;; as inherited-from-trash and stay invisible in the Trash UI.
      (is (true? (t2/select-one-fn :archived_directly :model/Card :id card-id)))
      (testing "archival is a soft delete: archived: false reverses it"
        (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/question/" card-id)
                                         {:archived false})]
          (is (false? (:archived resp))))
        (is (false? (t2/select-one-fn :archived :model/Card :id card-id)))
        (is (false? (t2/select-one-fn :archived_directly :model/Card :id card-id)))))))

(deftest update-question-replace-query-test
  (testing "Replacing the underlying query via :query (base64)"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card To Re-query"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [products-id  (mt/id :products)
            products-fk  [(db-name) "PUBLIC" "PRODUCTS"]
            new-query    (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                               {:query {:lib/type "mbql/query"
                                                        :stages   [{:lib/type     "mbql.stage/mbql"
                                                                    :source-table products-fk
                                                                    :limit        5}]}})
            base64-query (:query new-query)
            _resp        (mt/user-http-request :rasta :put 200 (str "agent/v1/question/" card-id)
                                               {:query base64-query})
            persisted    (t2/select-one-fn :dataset_query :model/Card :id card-id)
            stages       (:stages persisted)
            source-table (some :source-table stages)]
        ;; Query was replaced - source-table changed from orders to products.
        ;; Construct sends portable FKs over the wire, but the persisted dataset_query is the
        ;; resolved MBQL 5 map with numeric IDs.
        (is (some? persisted))
        (is (= products-id source-table)
            (str "Expected persisted dataset_query :source-table to be the products table id "
                 products-id ", got " source-table))))))

(deftest update-question-not-found-test
  (testing "Returns 404 when card does not exist"
    (mt/user-http-request :rasta :put 404 "agent/v1/question/999999"
                          {:name "doesn't matter"})))

(deftest update-question-write-perm-test
  (testing "Returns 403 when caller lacks write access on the card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {locked-coll-id :id} {:name "Locked Coll"}
                     :model/Card       {card-id :id}        {:name          "Hidden Card"
                                                             :dataset_query (orders-count-query)
                                                             :display       :table
                                                             :collection_id locked-coll-id}]
        (mt/user-http-request :rasta :put 403 (str "agent/v1/question/" card-id)
                              {:name "Forbidden Rename"})))))

(deftest update-question-target-perm-test
  (testing "Returns 403 when caller can write source collection but not target"
    ;; Guard against an LLM moving a card into a collection the user can't normally write.
    ;; api/write-check on the card covers the source side; collection/check-allowed-to-change-
    ;; collection covers the target side.
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable Src"}
                     :model/Collection {locked-id   :id} {:name "Locked Dest"}
                     :model/Card       {card-id     :id} {:name          "Card In Writable"
                                                          :dataset_query (orders-count-query)
                                                          :display       :table
                                                          :collection_id writable-id}]
        (perms/grant-collection-readwrite-permissions!
         (perms-group/all-users) writable-id)
        (mt/user-http-request :rasta :put 403 (str "agent/v1/question/" card-id)
                              {:collection_id locked-id})))))

(deftest update-question-display-validation-test
  (testing "Rejects unknown :display values with 400"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card Display Validation"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      ;; The Malli enum on ::card-display should reject "potato" with a validation error.
      (mt/user-http-request :rasta :put 400 (str "agent/v1/question/" card-id)
                            {:display "potato"}))))

(deftest update-question-cycle-rejection-test
  (testing "Returns 400 when swapping :query introduces a self-referencing cycle"
    ;; Mirror REST's `lib/check-card-overwrite` gate. A query whose source is the very
    ;; card being updated would persist a cyclic card otherwise (branch review A1).
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card About To Cycle"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [cycle-query  {:database (mt/id)
                          :type     :query
                          :query    {:source-table (str "card__" card-id)}}
            base64-query (u/encode-base64 (json/encode cycle-query))]
        (mt/user-http-request :rasta :put 400 (str "agent/v1/question/" card-id)
                              {:query base64-query}))
      ;; Persisted query unchanged - source-table still the orders table id, not the card.
      (let [persisted (t2/select-one-fn :dataset_query :model/Card :id card-id)]
        (is (= (mt/id :orders) (some :source-table (:stages persisted)))
            "dataset_query should not have been swapped to a card__ reference")))))

(deftest update-question-query-perm-test
  (testing "Returns 403 when swapping :query to one referencing data the caller cannot run"
    ;; Guard against the gap retro identified in branch review:
    ;; collection write on a card does NOT grant the right to repoint it at forbidden data.
    ;; REST's `check-allowed-to-modify-query` runs in the REST wrapper above `queries/update-card!`;
    ;; the agent endpoint calls `update-card!` directly, so we have to gate it ourselves.
    (mt/with-restored-data-perms!
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable For Q-Swap"}
                       :model/Card       {card-id :id}     {:name          "Card With Allowed Query"
                                                            :dataset_query (orders-count-query)
                                                            :display       :table
                                                            :collection_id writable-id}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable-id)
          ;; Block data access on the sample DB for the All Users group.
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
          (let [products-fk  [(db-name) "PUBLIC" "PRODUCTS"]
                new-query    (mt/user-http-request :crowberto :post 200 "agent/v2/construct-query"
                                                   {:query {:lib/type "mbql/query"
                                                            :stages   [{:lib/type     "mbql.stage/mbql"
                                                                        :source-table products-fk
                                                                        :limit        5}]}})
                base64-query (:query new-query)]
            (mt/user-http-request :rasta :put 403 (str "agent/v1/question/" card-id)
                                  {:query base64-query}))
          ;; Persisted query unchanged - dataset_query.stages[0].source-table is the orders table id.
          (let [persisted (t2/select-one-fn :dataset_query :model/Card :id card-id)]
            (is (= (mt/id :orders) (some :source-table (:stages persisted)))
                "dataset_query should not have been swapped")))))))

;;; ---------------------------------------------- Update Dashboard Tests ------------------------------------------

(deftest update-dashboard-test
  (testing "Patches name and description"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Original Name"}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:name "Renamed by Agent"
                                        :description "Set by agent"})]
        (is (=? {:id          dash-id
                 :name        "Renamed by Agent"
                 :description "Set by agent"
                 :archived    false}
                resp)))
      (is (= "Renamed by Agent" (t2/select-one-fn :name :model/Dashboard :id dash-id)))
      (is (= "Set by agent" (t2/select-one-fn :description :model/Dashboard :id dash-id)))))
  (testing "Moving a dashboard sets collection_id and moves its cards"
    (mt/with-temp [:model/Collection {dest-coll-id :id} {:name "Agent Dash Dest"}
                   :model/Dashboard  {dash-id :id}      {:name "Dash To Move"}
                   :model/Card       {card-id :id}      {:name          "Card On Dash"
                                                         :dataset_query (orders-count-query)
                                                         :display       :table
                                                         :dashboard_id  dash-id}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:collection_id dest-coll-id})]
        (is (=? {:collection_id   dest-coll-id
                 :collection_path "Our analytics / Agent Dash Dest"}
                resp)))
      (is (= dest-coll-id (t2/select-one-fn :collection_id :model/Dashboard :id dash-id)))
      ;; cards on the dashboard should follow
      (is (= dest-coll-id (t2/select-one-fn :collection_id :model/Card :id card-id)))))
  (testing "Returns 404 when dashboard does not exist"
    (mt/user-http-request :rasta :put 404 "agent/v1/dashboard/999999"
                          {:name "doesn't matter"}))
  (testing "Returns 403 when caller lacks write access on the dashboard"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {locked-coll-id :id} {:name "Locked Coll For Dash"}
                     :model/Dashboard  {dash-id :id}        {:name          "Hidden Dash"
                                                             :collection_id locked-coll-id}]
        (mt/user-http-request :rasta :put 403 (str "agent/v1/dashboard/" dash-id)
                              {:name "Forbidden Rename"}))))
  (testing "Returns 403 when caller can write source collection but not target"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {writable-id :id} {:name "Writable Dash Src"}
                     :model/Collection {locked-id   :id} {:name "Locked Dash Dest"}
                     :model/Dashboard  {dash-id     :id} {:name          "Dash In Writable"
                                                          :collection_id writable-id}]
        (perms/grant-collection-readwrite-permissions!
         (perms-group/all-users) writable-id)
        (mt/user-http-request :rasta :put 403 (str "agent/v1/dashboard/" dash-id)
                              {:collection_id locked-id})))))

(deftest update-dashboard-archive-test
  (testing "Archiving a dashboard cascades to its cards"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Dash To Archive"}
                   :model/Card      {card-id :id} {:name          "Cascading Card"
                                                   :dataset_query (orders-count-query)
                                                   :display       :table
                                                   :dashboard_id  dash-id}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:archived true})]
        (is (true? (:archived resp))))
      (is (true? (t2/select-one-fn :archived :model/Dashboard :id dash-id)))
      (is (true? (t2/select-one-fn :archived :model/Card :id card-id)))
      (testing "archival is a soft delete: archived: false reverses it, cards included"
        (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                         {:archived false})]
          (is (false? (:archived resp))))
        (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id)))
        (is (false? (t2/select-one-fn :archived :model/Card :id card-id)))))))

(deftest update-dashboard-dashcards-add-test
  (testing "Add a card to the dashboard (autoplaced)"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Phase B Add Target"}
                   :model/Card      {card-id :id} {:name          "Card to add"
                                                   :dataset_query (orders-count-query)
                                                   :display       :table}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:dashcards [{:action "add" :card_id card-id}]})]
        (is (= 1 (count (:dashcard_ids resp))))
        (let [dashcards (t2/select :model/DashboardCard :dashboard_id dash-id)]
          (is (= 1 (count dashcards)))
          (is (= card-id (:card_id (first dashcards))))
          ;; Autoplaced - row and col are set even though we didn't provide them.
          (is (nat-int? (:row (first dashcards))))
          (is (nat-int? (:col (first dashcards)))))))))

(deftest update-dashboard-dashcards-multi-add-test
  (testing "Add multiple cards in one call - each one autoplaced w/o overlap"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Phase B Multi-add"}
                   :model/Card      {c1 :id}      {:name "C1" :dataset_query (orders-count-query) :display :table}
                   :model/Card      {c2 :id}      {:name "C2" :dataset_query (orders-count-query) :display :table}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id c1}
                                         {:action "add" :card_id c2}]})
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dash-id)
            positions (map (juxt :row :col) dashcards)]
        (is (= 2 (count dashcards)))
        (is (= 2 (count (set positions))) "Each dashcard should have a unique row/col")))))

(deftest update-dashboard-dashcards-add-heading-test
  (testing "Add a heading - a full-width virtual dashcard with no backing card"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Heading Target"}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:dashcards [{:action "add_heading" :text "Revenue"}]})]
        (is (= 1 (count (:dashcard_ids resp))))
        (is (=? {:card_id                nil
                 :row                    0
                 :col                    0
                 :size_x                 24
                 :size_y                 1
                 :visualization_settings {:virtual_card         {:display "heading"}
                                          :text                 "Revenue"
                                          :dashcard.background  false}}
                (t2/select-one :model/DashboardCard :dashboard_id dash-id)))))))

(deftest update-dashboard-dashcards-add-text-test
  (testing "Add a Markdown text card - a virtual dashcard with no backing card"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Text Target"}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:dashcards [{:action "add_text" :text "Orders *grew 12%*."}]})]
        (is (= 1 (count (:dashcard_ids resp))))
        (is (=? {:card_id                nil
                 :size_x                 12
                 :size_y                 3
                 :visualization_settings {:virtual_card {:display "text"}
                                          :text         "Orders *grew 12%*."}}
                (t2/select-one :model/DashboardCard :dashboard_id dash-id))))))
  (testing "display_size overrides the default text-card size"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Text Size Target"}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_text" :text "Full width" :display_size "full"}]})
      (is (=? {:size_x 24 :size_y 9}
              (t2/select-one :model/DashboardCard :dashboard_id dash-id))))))

(deftest update-dashboard-dashcards-narrative-layout-test
  (testing "Interleaved heading + card + text mutations autoplace in order without overlap"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Narrative Layout"}
                   :model/Card      {card-id :id} {:name          "Chart"
                                                   :dataset_query (orders-count-query)
                                                   :display       :table}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_heading" :text "Section 1"}
                                         {:action "add" :card_id card-id}
                                         {:action "add_text" :text "Narrative under the chart."}]})
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dash-id {:order-by [[:row :asc]]})
            heading   (first dashcards)
            chart     (second dashcards)]
        (is (= 3 (count dashcards)))
        ;; heading sits on top, the chart starts below it
        (is (= 0 (:row heading)))
        (is (>= (:row chart) (+ (:row heading) (:size_y heading))))
        ;; no two dashcards share a position
        (is (= 3 (count (set (map (juxt :row :col) dashcards)))))))))

(deftest update-dashboard-dashcards-virtual-card-validation-test
  (testing "add_text and add_heading require non-blank text"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Text Validation"}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_text"}]})
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_heading" :text ""}]})
      (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id)))))
  (testing "add_heading rejects display_size instead of silently ignoring it (headings are always full-width)"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Heading Size Validation"}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_heading" :text "KPIs" :display_size "wide"}]})
      (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id))))))

(deftest update-dashboard-dashcards-add-then-move-top-test
  (testing "A card added earlier in the batch reflows when a later move-to-top shifts the tab"
    ;; Regression: :placed used to record the just-inserted dashcard without its :id, so the
    ;; move-to-top shift ran `(t2/update! :model/DashboardCard nil ...)` — a silent no-op — and the
    ;; new card ended up overlapping the moved one.
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Add Then Move Top"}
                   :model/Card          {card-id :id} {:name "existing" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 12 :size_x 12 :size_y 5}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_text" :text "note"}
                                         {:action "move" :dashcard_id dc-id :position "top"}]})
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dash-id)
            moved     (first (filter (comp #{dc-id} :id) dashcards))
            text-card (first (remove (comp #{dc-id} :id) dashcards))]
        (is (= [0 0] ((juxt :row :col) moved)))
        (is (>= (:row text-card) (+ (:row moved) (:size_y moved)))
            "the just-added text card must sit below the moved card, not overlap it")))))

(deftest update-dashboard-dashcards-add-on-tabbed-dashboard-test
  (testing "New headings/text cards land on the dashboard's first tab and only collide with its cards"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Tabbed Target"}
                   :model/DashboardTab  {tab1-id :id} {:dashboard_id dash-id :name "One" :position 0}
                   :model/DashboardTab  {tab2-id :id} {:dashboard_id dash-id :name "Two" :position 1}
                   :model/Card          {card-id :id} {:name "on tab two" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard _             {:dashboard_id dash-id :dashboard_tab_id tab2-id :card_id card-id
                                                       :row 0 :col 0 :size_x 24 :size_y 4}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:dashcards [{:action "add_heading" :text "Tab one section"}]})]
        (is (=? {:tabs [{:id tab1-id :name "One"} {:id tab2-id :name "Two"}]}
                resp)
            "the response lists the tabs in display order"))
      (is (=? {:dashboard_tab_id tab1-id
               ;; the full-width card on tab 2 must not block row 0 of tab 1
               :row              0}
              (t2/select-one :model/DashboardCard :dashboard_id dash-id :card_id nil)))
      (testing "an explicit tab_id overrides the first-tab default and collides with that tab's cards"
        (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                              {:dashcards [{:action "add_text" :text "On tab two" :tab_id tab2-id}]})
        (is (=? {:dashboard_tab_id tab2-id
                 ;; placed below tab 2's existing full-width 4-row card
                 :row              4}
                (t2/select-one :model/DashboardCard :dashboard_id dash-id
                               :card_id nil :dashboard_tab_id tab2-id))))
      (testing "a tab_id that isn't a tab on this dashboard is a 404"
        (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                              {:dashcards [{:action "add_heading" :text "Nope" :tab_id 999999}]})))))

(deftest update-dashboard-dashcards-nil-tab-collision-test
  (testing "A nil-tab dashcard on a tabbed dashboard blocks first-tab placement (it renders there)"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Nil Tab Collision"}
                   :model/DashboardTab  {tab1-id :id} {:dashboard_id dash-id :name "One" :position 0}
                   :model/DashboardTab  _             {:dashboard_id dash-id :name "Two" :position 1}
                   :model/Card          {card-id :id} {:name "legacy" :dataset_query (orders-count-query) :display :table}
                   ;; predates the tabs: no dashboard_tab_id, but the frontend renders it on tab 1
                   :model/DashboardCard _             {:dashboard_id dash-id :dashboard_tab_id nil :card_id card-id
                                                       :row 0 :col 0 :size_x 24 :size_y 4}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add_heading" :text "Below the legacy card"}]})
      (is (=? {:dashboard_tab_id tab1-id
               :row              4}
              (t2/select-one :model/DashboardCard :dashboard_id dash-id :card_id nil))
          "the heading must land below the nil-tab card, not on top of it"))))

(deftest update-dashboard-restore-and-edit-test
  (testing "unarchiving and mutating dashcards in the same request works — restore-and-edit is one call"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Restore And Edit" :archived true}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:archived  false
                             :dashcards [{:action "add_heading" :text "Back from the trash"}]})
      (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id)))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id)))))

(deftest update-dashboard-lifecycle-checks-test
  (testing "dashcard mutations on an archived dashboard are rejected"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Archived Dash" :archived true}
                   :model/Card      {card-id :id} {:name "c" :dataset_query (orders-count-query) :display :table}]
      (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id card-id}]})))
  (testing "adding an archived card is rejected"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Live Dash"}
                   :model/Card      {card-id :id} {:name "archived c" :dataset_query (orders-count-query)
                                                   :display :table :archived true}]
      (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id card-id}]})
      (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id)))))
  (testing "adding a question internal to another dashboard is rejected"
    (mt/with-temp [:model/Dashboard {other-dash :id} {:name "Owner Dash"}
                   :model/Dashboard {dash-id :id}    {:name "Target Dash"}
                   :model/Card      {card-id :id}    {:name "dq" :dataset_query (orders-count-query)
                                                      :display :table :dashboard_id other-dash}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id card-id}]})))
  (testing "an internal dashboard question archived by its own removal can be re-added, and unarchives"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "DQ Roundtrip"}
                   :model/Card          {card-id :id} {:name "internal q" :dataset_query (orders-count-query)
                                                       :display :table :dashboard_id dash-id}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 12 :size_y 4}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "remove" :dashcard_id dc-id}]})
      (is (true? (t2/select-one-fn :archived :model/Card :id card-id))
          "removing the last dashcard archives the internal dashboard question")
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id card-id}]})
      (is (false? (t2/select-one-fn :archived :model/Card :id card-id))
          "re-adding it unarchives the internal dashboard question")
      (is (= 1 (t2/count :model/DashboardCard :dashboard_id dash-id)))))
  (testing "archiving and mutating dashcards in one request is rejected"
    ;; the post-mutation internal-question sync could otherwise unarchive dashboard questions
    ;; on the dashboard this same request just archived
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Archive Plus Mutate"}
                   :model/Card          {dq-id :id}   {:name "internal q" :dataset_query (orders-count-query)
                                                       :display :table :dashboard_id dash-id}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id dq-id
                                                       :row 0 :col 0 :size_x 12 :size_y 4}
                   :model/Card          {add-id :id}  {:name "to add" :dataset_query (orders-count-query)
                                                       :display :table}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:archived  true
                             :dashcards [{:action "add" :card_id add-id}]})
      (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id))
          "the rejected request must not have archived the dashboard")
      (is (t2/exists? :model/DashboardCard :id dc-id))))
  (testing "archiving via the agent endpoint records archived_directly, like the REST path"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "To Archive"}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:archived true})
      (is (true? (t2/select-one-fn :archived_directly :model/Dashboard :id dash-id))))))

(deftest update-dashboard-dashcards-move-bottom-test
  (testing "Moving a card to the bottom places it below the tab's bottom edge, not back into its old slot"
    ;; Regression: "bottom" used first-fit autoplace over the layout minus the moved card, so a card
    ;; moved from the top would be re-placed straight into the gap it had just vacated.
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Move Bottom"}
                   :model/Card          {card-id :id} {:name "c" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {a-dc :id}    {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 12 :size_y 4}
                   :model/DashboardCard {b-dc :id}    {:dashboard_id dash-id :card_id card-id
                                                       :row 4 :col 0 :size_x 12 :size_y 4}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "move" :dashcard_id a-dc :position "bottom"}]})
      (let [a (t2/select-one :model/DashboardCard :id a-dc)
            b (t2/select-one :model/DashboardCard :id b-dc)]
        (is (>= (:row a) (+ (:row b) (:size_y b)))
            "the moved card must land below the other card's bottom edge")))))

(deftest update-dashboard-dashcard-ids-row-col-order-test
  (testing "Response dashcard_ids come back in row/col order, not insertion order"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Ordered Ids"}
                   :model/Card          {card-id :id} {:name "c" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {a-dc :id}    {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 12 :size_y 4}
                   :model/DashboardCard {b-dc :id}    {:dashboard_id dash-id :card_id card-id
                                                       :row 4 :col 0 :size_x 12 :size_y 4}]
      (let [resp (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                       {:dashcards [{:action "move" :dashcard_id b-dc :position "top"}]})]
        (is (= [b-dc a-dc] (:dashcard_ids resp))
            "after moving b to the top it should be listed first")))))

(deftest update-dashboard-dashcards-update-text-test
  (testing "update_text replaces a text card's text in place, keeping position and size"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Retext Target"}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id :card_id nil
                                                     :row 5 :col 3 :size_x 12 :size_y 3
                                                     :visualization_settings
                                                     {:virtual_card {:display "text"}
                                                      :text         "Old narrative."}}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "update_text" :dashcard_id dc-id :text "New narrative."}]})
      (is (=? {:row                    5
               :col                    3
               :size_x                 12
               :size_y                 3
               :visualization_settings {:virtual_card {:display "text"}
                                        :text         "New narrative."}}
              (t2/select-one :model/DashboardCard :id dc-id)))))
  (testing "update_text works on headings too"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Retitle Target"}]
      (let [resp  (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                        {:dashcards [{:action "add_heading" :text "Old Title"}]})
            dc-id (first (:dashcard_ids resp))]
        (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                              {:dashcards [{:action "update_text" :dashcard_id dc-id :text "New Title"}]})
        (is (=? {:visualization_settings {:virtual_card {:display "heading"}
                                          :text         "New Title"}}
                (t2/select-one :model/DashboardCard :id dc-id))))))
  (testing "update_text works on a legacy text card that predates virtual_card settings"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Legacy Retext"}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id :card_id nil
                                                     :row 0 :col 0 :size_x 12 :size_y 3
                                                     :visualization_settings {:text "legacy words"}}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "update_text" :dashcard_id dc-id :text "fresh words"}]})
      (is (=? {:visualization_settings {:text "fresh words"}}
              (t2/select-one :model/DashboardCard :id dc-id)))))
  (testing "update_text on a card-backed dashcard is a 400"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Retext Chart"}
                   :model/Card          {card-id :id} {:name "chart" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id :card_id card-id
                                                     :row 0 :col 0 :size_x 12 :size_y 9}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "update_text" :dashcard_id dc-id :text "nope"}]})))
  (testing "update_text on another dashboard's dashcard is a 404"
    (mt/with-temp [:model/Dashboard {dash-id :id}  {:name "Retext Mine"}
                   :model/Dashboard {other-id :id} {:name "Retext Other"}
                   :model/DashboardCard {dc-id :id} {:dashboard_id other-id :card_id nil
                                                     :row 0 :col 0 :size_x 24 :size_y 1
                                                     :visualization_settings
                                                     {:virtual_card {:display "heading"}
                                                      :text         "elsewhere"}}]
      (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "update_text" :dashcard_id dc-id :text "nope"}]}))))

(deftest update-dashboard-dashcards-remove-virtual-card-test
  (testing "A text card can be removed by dashcard_id like any other dashcard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Remove Text Card"}]
      (let [resp        (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                                              {:dashcards [{:action "add_text" :text "temporary"}]})
            dashcard-id (first (:dashcard_ids resp))]
        (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                              {:dashcards [{:action "remove" :dashcard_id dashcard-id}]})
        (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id)))))))

(deftest update-dashboard-dashcards-remove-test
  (testing "Remove a dashcard"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Phase B Remove"}
                   :model/Card          {card-id :id} {:name "to remove" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 12 :size_y 9}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "remove" :dashcard_id dashcard-id}]})
      (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id))))))

(deftest update-dashboard-dashcards-move-top-test
  (testing "Move a dashcard to the top"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Phase B Move"}
                   :model/Card          {card-id :id} {:name "movable" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 5 :col 3 :size_x 12 :size_y 9}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "move" :dashcard_id dashcard-id :position "top"}]})
      (let [moved (t2/select-one :model/DashboardCard :id dashcard-id)]
        (is (= 0 (:row moved)))
        (is (= 0 (:col moved)))))))

(deftest update-dashboard-dashcards-move-top-reflow-test
  (testing "Move to top shifts other cards down by the moved card's :size_y - no overlap"
    ;; Regression for branch review #2: previously slammed the moved card at {:row 0 :col 0}
    ;; without reflowing the rest, leaving cards on top of each other.
    (mt/with-temp [:model/Dashboard     {dash-id :id}    {:name "Move-Top Reflow"}
                   :model/Card          {a-card :id}     {:name "A" :dataset_query (orders-count-query) :display :table}
                   :model/Card          {b-card :id}     {:name "B" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {a-dc :id}       {:dashboard_id dash-id :card_id a-card
                                                          :row 0 :col 0 :size_x 12 :size_y 6}
                   :model/DashboardCard {b-dc :id}       {:dashboard_id dash-id :card_id b-card
                                                          :row 6 :col 0 :size_x 12 :size_y 6}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "move" :dashcard_id b-dc :position "top"}]})
      (let [a (t2/select-one :model/DashboardCard :id a-dc)
            b (t2/select-one :model/DashboardCard :id b-dc)]
        ;; b lands at row 0; a shifts down by b's :size_y (6).
        (is (= 0 (:row b)))
        (is (= 6 (:row a)))
        ;; Bounding boxes don't intersect.
        (is (>= (:row a) (+ (:row b) (:size_y b)))
            "A should sit entirely below B after the move-to-top reflow")))))

(deftest update-dashboard-dashcards-mixed-test
  (testing "Mix add + remove + metadata patch in a single call"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Phase B Mix"}
                   :model/Card          {keep-card :id} {:name "keep" :dataset_query (orders-count-query) :display :table}
                   :model/Card          {add-card :id}  {:name "add"  :dataset_query (orders-count-query) :display :table}
                   :model/Card          {drop-card :id} {:name "drop" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {keep-dc :id}   {:dashboard_id dash-id :card_id keep-card
                                                         :row 0 :col 0 :size_x 6 :size_y 4}
                   :model/DashboardCard {drop-dc :id}   {:dashboard_id dash-id :card_id drop-card
                                                         :row 4 :col 0 :size_x 6 :size_y 4}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:description "Mixed patch"
                             :dashcards [{:action "remove" :dashcard_id drop-dc}
                                         {:action "add"    :card_id add-card}]})
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dash-id)
            card-ids  (set (map :card_id dashcards))]
        (is (= #{keep-card add-card} card-ids))
        (is (some #(= keep-dc (:id %)) dashcards) "Untouched dashcard survives")
        (is (= "Mixed patch" (t2/select-one-fn :description :model/Dashboard :id dash-id)))))))

(deftest update-dashboard-dashcards-add-missing-card-test
  (testing "Returns 404 when add references a missing card"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Phase B Missing Card"}]
      (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "add" :card_id 999999}]}))))

(deftest update-dashboard-dashcards-remove-missing-dashcard-test
  (testing "Returns 404 when remove references a dashcard not on this dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Phase B Wrong Dashcard"}]
      (mt/user-http-request :rasta :put 404 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "remove" :dashcard_id 999999}]}))))

(deftest update-dashboard-dashcards-move-validation-test
  (testing "Move requires :position - omitting it returns 400"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Phase B Move Validation"}
                   :model/Card          {card-id :id} {:name "x" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 6 :size_y 4}]
      (mt/user-http-request :rasta :put 400 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "move" :dashcard_id dc-id}]}))))

;;; ------------------------------------------------- Execute SQL Tests --------------------------------------------

(deftest execute-sql-test
  (testing "Admin can run a native SQL query (default perms)"
    (let [resp (mt/user-http-request :crowberto :post 202 "agent/v1/execute-sql"
                                     {:database_id (mt/id)
                                      :sql         "SELECT 1 AS one"})]
      (is (= "completed" (:status resp)))
      (is (= [[1]] (-> resp :data :rows)))))
  (testing "Returns 403 when the user lacks native-query permission"
    (mt/with-no-data-perms-for-all-users!
      (mt/user-http-request :rasta :post 403 "agent/v1/execute-sql"
                            {:database_id (mt/id)
                             :sql         "SELECT 1"})))
  (testing "Returns 403 when the kill-switch setting is disabled"
    (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
      (mt/user-http-request :crowberto :post 403 "agent/v1/execute-sql"
                            {:database_id (mt/id)
                             :sql         "SELECT 1"})))
  (testing "Malformed SQL returns the userland :failed envelope (HTTP 400), not a raw 500"
    ;; Regression for branch review #1: previously bypassed userland middleware, so a
    ;; bad query threw `ExceptionInfo` and surfaced as HTTP 500. Now goes through
    ;; `prepare-agent-query`, which wraps errors in the documented `:failed` envelope
    ;; and surfaces them as a 400 with a structured body.
    (let [resp (mt/user-http-request :crowberto :post 400 "agent/v1/execute-sql"
                                     {:database_id (mt/id)
                                      :sql         "SELECT * FROM table_that_does_not_exist"})]
      ;; The streaming pipeline wraps the failure in :via[0]/:status.
      (is (= "failed" (some-> resp :via first :status)))
      (is (string? (some-> resp :via first :error)))))
  (testing "A successful query records a QueryExecution audit row tagged :agent"
    ;; Bypass-of-userland regression (#1): without `prepare-agent-query` no audit row was
    ;; written. Verify a row lands and carries the agent context. QueryExecutions are saved in async batches by
    ;; default, so save them synchronously to be able to assert on them right away.
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (let [before (t2/count :model/QueryExecution)]
        (mt/user-http-request :crowberto :post 202 "agent/v1/execute-sql"
                              {:database_id (mt/id)
                               :sql         "SELECT 1 AS audit_probe"})
        (let [latest (u/poll {:thunk       (fn [] (t2/select-one :model/QueryExecution
                                                                 {:order-by [[:started_at :desc]]}))
                              :done?       (fn [_qe] (> (t2/count :model/QueryExecution) before))
                              :timeout-ms  5000
                              :interval-ms 50})]
          (is (some? latest) "QueryExecution row should be inserted within 5s")
          (is (= :agent (:context latest))))))))

;;; ------------------------------------------------- Read Resource Tests -----------------------------------------

(deftest read-resource-test
  (testing "Dispatches a top-level URI through the shared resolver"
    (let [resp (mt/user-http-request :crowberto :post 200 "agent/v1/read-resource"
                                     {:uris ["metabase://databases"]})]
      (is (=? {:resources [(fn [r] (and (= "metabase://databases" (:uri r))
                                        (some? (:content r))))]
               :output    string?}
              resp))
      ;; Output is XML-shaped for LLM consumption.
      (is (str/includes? (:output resp) "<resources>"))
      (is (str/includes? (:output resp) "metabase://databases"))))
  (testing "Fetches a single-entity URI"
    (let [resp (mt/user-http-request :crowberto :post 200 "agent/v1/read-resource"
                                     {:uris [(str "metabase://table/" (mt/id :orders))]})]
      (is (= 1 (count (:resources resp))))
      (is (some? (-> resp :resources first :content)))))
  (testing "Returns 400 when too many URIs"
    (let [uris (vec (repeat 10 "metabase://databases"))]
      (mt/user-http-request :crowberto :post 400 "agent/v1/read-resource"
                            {:uris uris})))
  (testing "Reports a per-URI error rather than failing the whole call"
    (let [resp (mt/user-http-request :crowberto :post 200 "agent/v1/read-resource"
                                     {:uris ["metabase://nonsense/path"]})]
      (is (= 1 (count (:resources resp))))
      (is (nil? (-> resp :resources first :content)))
      (is (some? (-> resp :resources first :error))))))
