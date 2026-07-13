(ns metabase.agent-api.execute-query-test
  "The v2 `execute_query` tool: one call that validates a query, runs it, pages through it, and hands
   back a handle naming what ran."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.execute-query :as execute-query]
   [metabase.agent-api.handles :as handles]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- execute!
  ([body] (execute! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/execute-query" body)))

(defn- refusal
  "The message a refused call teaches with. A teaching error's body is the message itself; the
   resolution pipeline's errors are maps that carry it alongside their `:error` keyword."
  [response]
  (if (string? response) response (str (:message response))))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- orders-query
  "A portable MBQL 5 query against ORDERS — the external dialect the tool takes: names, never ids."
  [& {:keys [limit aggregation breakout]}]
  {:lib/type "mbql/query"
   :stages   [(cond-> {:lib/type     "mbql.stage/mbql"
                       :source-table [(db-name) "PUBLIC" "ORDERS"]}
                aggregation (assoc :aggregation (vec aggregation))
                breakout    (assoc :breakout    (vec breakout))
                limit       (assoc :limit       limit))]})

(defn- orders-field [col]
  ["field" {} [(db-name) "PUBLIC" "ORDERS" col]])

;;; ──────────────────────────────────────────────────────────────────
;;; One call: validate, run, hand back a handle
;;; ──────────────────────────────────────────────────────────────────

(deftest executes-plain-mbql-and-returns-a-handle-test
  (let [response (execute! {:query (orders-query :aggregation [["count" {}]])})]
    (testing "the rows come back in the dataset REST shape"
      (is (= ["count"] (mapv :name (:cols response))))
      (is (= 1 (:row_count response)))
      (is (= 1 (count (:rows response))))
      (is (pos? (ffirst (:rows response)))))
    (testing "and a handle names the query that ran"
      (is (some? (parse-uuid (:query_handle response)))))
    (testing "passing that handle back re-runs it without re-sending the MBQL"
      (is (= (dissoc response :query_handle)
             (dissoc (execute! {:query_handle (:query_handle response)}) :query_handle))))))

(deftest the-handle-is-content-addressed-test
  (testing "the same query from the same user is the same handle, however it was named"
    (let [first-run  (execute! {:query (orders-query :limit 3)})
          second-run (execute! {:query (orders-query :limit 3)})
          from-handle (execute! {:query_handle (:query_handle first-run)})]
      (is (= (:query_handle first-run)
             (:query_handle second-run)
             (:query_handle from-handle))))))

(deftest a-handle-belongs-to-the-user-who-minted-it-test
  (let [handle (:query_handle (execute! :rasta 200 {:query (orders-query :limit 1)}))]
    (testing "another user cannot resolve it — the store is keyed by (user, uuid)"
      (is (re-find #"No query handle" (refusal (execute! :lucky 404 {:query_handle handle})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The external dialect, and what it teaches
;;; ──────────────────────────────────────────────────────────────────

(deftest portable-names-resolve-test
  (let [response (execute! {:query (orders-query :aggregation [["count" {}]]
                                                 :breakout    [(orders-field "USER_ID")])})]
    (is (= ["USER_ID" "count"] (mapv :name (:cols response))))
    (is (pos? (:row_count response)))))

(deftest an-unknown-name-teaches-the-way-out-test
  (testing "an unknown table names the recovery — and, deliberately, not the tables it could have meant:
            the resolution pipeline's metadata provider is un-sandboxed, so a candidate list would be an
            existence oracle for tables the caller may not read"
    (let [response (execute! :rasta 400
                             {:query {:lib/type "mbql/query"
                                      :stages   [{:lib/type     "mbql.stage/mbql"
                                                  :source-table [(db-name) "PUBLIC" "ORDER"]}]}})]
      (is (=? {:error "unknown-table"} response))
      (is (re-find #"List the database's tables" (refusal response)))
      (is (not (re-find #"ORDERS" (refusal response))))))
  (testing "an unknown column names its own recovery"
    (let [response (execute! :rasta 400
                             {:query (orders-query :breakout [(orders-field "TOTALL")])})]
      (is (=? {:error "unknown-field"} response))
      (is (re-find #"List the table's columns" (refusal response))))))

(deftest native-sql-belongs-to-execute-sql-test
  (testing "a native query sent inline names the tool that runs it, rather than dying as malformed MBQL"
    (is (re-find #"execute_sql"
                 (refusal (execute! :rasta 400
                                    {:query {:lib/type "mbql/query"
                                             :stages   [{:lib/type "mbql.stage/native"
                                                         :native   "SELECT 1"}]}})))))
  (testing "and so does one that arrives by handle"
    (let [handle (handles/store-query! (mt/user->id :rasta)
                                       {:database (mt/id)
                                        :lib/type :mbql/query
                                        :stages   [{:lib/type :mbql.stage/native :native "SELECT 1"}]})]
      (is (re-find #"execute_sql" (refusal (execute! :rasta 400 {:query_handle handle})))))))

(deftest a-query-that-fails-in-the-warehouse-teaches-rather-than-500s-test
  (testing "the database's own message comes back as a refusal the model can act on"
    (let [handle   (handles/store-query! (mt/user->id :rasta)
                                         {:database (mt/id)
                                          :lib/type :mbql/query
                                          :stages   [{:lib/type     :mbql.stage/mbql
                                                      :source-table (mt/id :orders)
                                                      :filters      [[:= {} [:field {} 999999999] 1]]}]})
          response (execute! :rasta 400 {:query_handle handle})]
      (is (re-find #"The query failed" (refusal response))))))

;;; ──────────────────────────────────────────────────────────────────
;;; validate_only — the dry run
;;; ──────────────────────────────────────────────────────────────────

(deftest validate-only-mints-a-handle-and-runs-nothing-test
  (let [before   (t2/count :model/QueryExecution)
        response (execute! {:query (orders-query :limit 5) :validate_only true})]
    (testing "the handle is there, and nothing else is — nothing ran"
      (is (= #{:query_handle :validated} (set (keys response))))
      (is (true? (:validated response)))
      (is (some? (parse-uuid (:query_handle response)))))
    (testing "no warehouse query was executed"
      (is (= before (t2/count :model/QueryExecution))))
    (testing "and the handle it minted runs"
      (is (= 5 (:row_count (execute! {:query_handle (:query_handle response)})))))))

(deftest validate-only-refuses-an-invalid-query-test
  (is (=? {:error "unknown-table"}
          (execute! :rasta 400
                    {:validate_only true
                     :query {:lib/type "mbql/query"
                             :stages   [{:lib/type     "mbql.stage/mbql"
                                         :source-table [(db-name) "PUBLIC" "NOT_A_TABLE"]}]}}))))

;;; ──────────────────────────────────────────────────────────────────
;;; row_limit and offset
;;; ──────────────────────────────────────────────────────────────────

(deftest row-limit-defaults-to-100-test
  (is (= execute-query/default-row-limit
         (:row_count (execute! {:query (orders-query)})))))

(deftest a-row-limit-above-the-default-is-honored-test
  (testing "a page is the size the caller asked for, up to the maximum"
    (is (= 500 (:row_count (execute! {:query (orders-query) :row_limit 500}))))))

(deftest row-limit-is-capped-test
  (is (=? {:errors {:row_limit "nullable integer between 1 and 2000 inclusive"}}
          (execute! :rasta 400 {:query (orders-query) :row_limit 2001}))))

(deftest offset-pages-through-the-handle-test
  (let [page-1 (execute! {:query (orders-query) :row_limit 2})
        page-2 (execute! {:query_handle (:query_handle page-1) :row_limit 2 :offset 2})]
    (testing "the first page steers to the next one"
      (is (true? (:truncated page-1)))
      (is (re-find #"offset: 2" (:truncation_message page-1))))
    (testing "and the next page is the next rows — the query never re-travels"
      (is (= 2 (:row_count page-2)))
      (is (not= (:rows page-1) (:rows page-2)))
      (is (= (:query_handle page-1) (:query_handle page-2))))))

(deftest the-last-page-is-not-truncated-test
  (let [response (execute! {:query (orders-query :aggregation [["count" {}]]) :row_limit 10})]
    (is (= 1 (:row_count response)))
    (is (not (contains? response :truncated)))))

(deftest the-querys-own-limit-caps-the-set-test
  (testing "a `limit:` the caller wrote is the size of the whole result, not of one page"
    (let [page-1 (execute! {:query (orders-query :limit 5) :row_limit 3})
          page-2 (execute! {:query_handle (:query_handle page-1) :row_limit 3 :offset 3})]
      (is (= 3 (:row_count page-1)))
      (is (true? (:truncated page-1)))
      (testing "the second page stops at the limit rather than running past it"
        (is (= 2 (:row_count page-2)))
        (is (not (contains? page-2 :truncated))))))
  (testing "and an offset past it says so instead of returning an empty page that reads as an answer"
    (is (re-find #"own limit of 5 rows"
                 (refusal (execute! :rasta 400 {:query (orders-query :limit 5) :row_limit 5 :offset 5}))))))

(deftest paging-a-handle-keeps-the-handle-it-was-given-test
  (testing "the response names the handle the caller passed, which is what the steer tells them to reuse"
    (let [page-1 (execute! {:query (orders-query) :row_limit 2})
          page-2 (execute! {:query_handle (:query_handle page-1) :row_limit 2 :offset 2})]
      (is (= (:query_handle page-1) (:query_handle page-2))))))

(deftest a-page-never-exceeds-the-instances-own-row-cap-test
  (testing "an instance that caps rows below the requested row_limit gets pages of the cap, still steering
            to a reachable next offset — a page sized above the cap would be trimmed after the SQL window
            was drawn, and the rows in between would be skipped by the next offset"
    (mt/with-temporary-setting-values [unaggregated-query-row-limit 4]
      (let [response (execute! {:query (orders-query) :row_limit 100})]
        (is (= 4 (:row_count response)))
        (is (true? (:truncated response)))
        (is (re-find #"offset: 4" (:truncation_message response)))
        (testing "and that offset is accepted"
          (is (= 4 (:row_count (execute! {:query_handle (:query_handle response)
                                          :row_limit    100
                                          :offset       4})))))))))

(deftest an-unordered-page-says-its-order-is-not-guaranteed-test
  (testing "paging compiles to SQL OFFSET, which is only stable under an order-by"
    (let [unordered (execute! {:query (orders-query) :row_limit 2})
          ordered   (execute! {:query (assoc-in (orders-query) [:stages 0 :order-by]
                                                [["asc" {} (orders-field "ID")]])
                               :row_limit 2})]
      (is (re-find #"no `order-by`" (:truncation_message unordered)))
      (is (not (re-find #"no `order-by`" (:truncation_message ordered)))))))

(deftest a-zero-limit-is-refused-the-same-way-on-both-paths-test
  (testing "validate_only cannot bless a query that running the same handle would refuse"
    (let [zero-limit {:query (orders-query :limit 0)}]
      (is (re-find #"`limit` must be a positive integer"
                   (refusal (execute! :rasta 400 (assoc zero-limit :validate_only true)))))
      (is (re-find #"`limit` must be a positive integer"
                   (refusal (execute! :rasta 400 zero-limit)))))))

(deftest an-offset-mbql-cannot-express-is-refused-test
  (testing "MBQL pages by page number, so an offset it cannot express is named rather than rounded"
    (is (re-find #"multiple of the page size"
                 (refusal (execute! :rasta 400 {:query (orders-query) :row_limit 100 :offset 150}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Exactly one of query | query_handle
;;; ──────────────────────────────────────────────────────────────────

(deftest exactly-one-source-test
  (testing "neither"
    (is (re-find #"Provide exactly one of `query`, `query_handle`"
                 (refusal (execute! :rasta 400 {})))))
  (testing "both"
    (is (re-find #"Provide only one of `query`, `query_handle`"
                 (refusal (execute! :rasta 400 {:query        (orders-query)
                                                :query_handle (str (random-uuid))}))))))

(deftest an-unknown-handle-names-the-fix-test
  (is (re-find #"send the query itself in `query`"
               (refusal (execute! :rasta 404 {:query_handle (str (random-uuid))})))))

;;; ──────────────────────────────────────────────────────────────────
;;; response_format
;;; ──────────────────────────────────────────────────────────────────

(deftest response-format-shapes-the-columns-test
  (let [concise  (execute! {:query (orders-query :limit 1)})
        detailed (execute! {:query (orders-query :limit 1) :response_format "detailed"})]
    (testing "concise describes a column by the result-column projection, and nothing outside it"
      (let [col (first (:cols concise))]
        (is (empty? (remove #{:name :display_name :description :base_type :effective_type :semantic_type}
                            (keys col))))
        (is (every? (set (keys col)) [:name :base_type]))))
    (testing "detailed carries every field the query processor knows about it"
      (is (contains? (first (:cols detailed)) :field_ref)))
    (testing "the rows are the same either way"
      (is (= (:rows concise) (:rows detailed))))))
