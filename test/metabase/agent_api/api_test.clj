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

(deftest search-finds-models-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
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
      (is (true? (t2/select-one-fn :archived_directly :model/Card :id card-id))))))

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
      (is (true? (t2/select-one-fn :archived :model/Card :id card-id)))))
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

(deftest update-dashboard-dashcards-remove-test
  (testing "Remove a dashcard"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Phase B Remove"}
                   :model/Card          {card-id :id} {:name "to remove" :dataset_query (orders-count-query) :display :table}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 12 :size_y 9}]
      (mt/user-http-request :rasta :put 200 (str "agent/v1/dashboard/" dash-id)
                            {:dashcards [{:action "remove" :dashcard_id dashcard-id}]})
      (is (zero? (count (t2/select :model/DashboardCard :dashboard_id dash-id)))))))

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
