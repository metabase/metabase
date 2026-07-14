(ns metabase.agent-api.execute-sql-test
  "The v2 `execute_sql` tool: raw SQL run as the caller, with a handle naming what ran, values for the
   query's variables, and the two gates SQL passes that MBQL does not."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.execute-sql :as execute-sql]
   [metabase.agent-api.handles :as handles]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- execute!
  ([body] (execute! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/execute-sql" (assoc body :database_id (mt/id)))))

(defn- refusal
  "The message a refused call teaches with — a teaching error's body is the message itself."
  [response]
  (if (string? response) response (str (:message response))))

(def ^:private orders-sql
  "SELECT ID, TOTAL FROM ORDERS ORDER BY ID")

;;; ──────────────────────────────────────────────────────────────────
;;; One call: run the SQL, hand back a handle
;;; ──────────────────────────────────────────────────────────────────

(deftest runs-sql-and-returns-a-handle-test
  (let [response (execute! {:sql "SELECT count(*) AS C FROM ORDERS"})]
    (testing "the rows come back in the dataset REST shape"
      (is (= ["C"] (mapv :name (:cols response))))
      (is (= 1 (:row_count response)))
      (is (= 1 (count (:rows response)))))
    (testing "and a handle names the query that ran"
      (is (some? (parse-uuid (:query_handle response)))))
    (testing "passing that handle back re-runs it without re-sending the SQL"
      (is (= (dissoc response :query_handle)
             (dissoc (mt/user-http-request :crowberto :post 200 "agent/v2/execute-sql"
                                           {:query_handle (:query_handle response)})
                     :query_handle))))))

(deftest the-handle-is-content-addressed-test
  (testing "the same SQL from the same user is the same handle"
    (is (= (:query_handle (execute! {:sql orders-sql}))
           (:query_handle (execute! {:sql orders-sql}))))))

(deftest a-handle-belongs-to-the-user-who-minted-it-test
  (let [handle (:query_handle (execute! {:sql orders-sql}))]
    (testing "another user cannot resolve it — the store is keyed by (user, uuid)"
      (is (re-find #"No query handle"
                   (refusal (mt/user-http-request :rasta :post 404 "agent/v2/execute-sql"
                                                  {:query_handle handle})))))))

(deftest an-mbql-handle-names-the-tool-that-runs-it-test
  (testing "a handle minted by `execute_query` is MBQL, and this tool refuses it rather than running it under
            the native-query scope"
    (let [handle (handles/store-query! (mt/user->id :crowberto)
                                       {:database (mt/id)
                                        :lib/type :mbql/query
                                        :stages   [{:lib/type     :mbql.stage/mbql
                                                    :source-table (mt/id :orders)}]})]
      (is (re-find #"Run it with `execute_query`"
                   (refusal (mt/user-http-request :crowberto :post 400 "agent/v2/execute-sql"
                                                  {:query_handle handle})))))))

(deftest the-handle-saves-the-sql-that-ran-test
  (testing "a run mints the handle a save takes, so SQL reaches a saved question with no construct step and
            without the SQL travelling through the model a second time"
    (let [handle (:query_handle (execute! {:sql                 "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
                                           :template_tag_values {:order_id 5}}))
          saved  (mt/with-test-user :crowberto
                   (mcp.tools/call-tool nil "create_question" {:query_handle handle
                                                               :name         "Order 5"}))
          card   (t2/select-one :model/Card
                                :id (:id (json/decode+kw (-> saved :content first :text))))]
      (is (= "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
             (get-in card [:dataset_query :stages 0 :native])))
      (testing "and the value the SQL ran with is the variable's default, which is where a saved question carries one"
        (is (= 5 (get-in card [:dataset_query :stages 0 :template-tags "order_id" :default])))))))

(deftest a-query-that-fails-in-the-warehouse-teaches-rather-than-500s-test
  (testing "the database's own message comes back as a refusal the model can act on"
    (is (re-find #"The query failed"
                 (refusal (execute! :crowberto 400 {:sql "SELECT * FROM NO_SUCH_TABLE"}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; template_tag_values
;;; ──────────────────────────────────────────────────────────────────

(deftest a-value-substitutes-through-its-template-tag-test
  (let [response (execute! {:sql                 "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
                            :template_tag_values {:order_id 5}})]
    (testing "the value is substituted as the type it is — a number as a number"
      (is (= 1 (:row_count response)))
      (is (= [[5]] (:rows response))))))

(deftest a-string-value-substitutes-as-a-string-test
  (let [response (execute! {:sql                 "SELECT count(*) AS C FROM PEOPLE WHERE STATE = {{state}}"
                            :template_tag_values {:state "CA"}})]
    (is (pos? (ffirst (:rows response))))))

(deftest the-values-ride-on-the-handle-test
  (testing "a handle names the SQL *and* the values it ran with, so a page needs neither again"
    (let [handle (:query_handle (execute! {:sql                 "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
                                           :template_tag_values {:order_id 5}}))]
      (is (= [[5]]
             (:rows (mt/user-http-request :crowberto :post 200 "agent/v2/execute-sql"
                                          {:query_handle handle})))))))

(deftest an-optional-clause-is-dropped-when-its-variable-has-no-value-test
  (testing "a variable the call gives no value for takes the SQL's own `[[...]]` path, as it does in the app"
    (let [sql     "SELECT count(*) AS C FROM ORDERS WHERE 1 = 1 [[AND ID = {{order_id}}]]"
          with    (execute! {:sql sql :template_tag_values {:order_id 5}})
          without (execute! {:sql sql})]
      (is (= [[1]] (:rows with)))
      (is (< 1 (ffirst (:rows without)))))))

(deftest a-value-for-a-variable-the-sql-does-not-declare-teaches-test
  (testing "the refusal names the variables the SQL does declare"
    (let [message (refusal (execute! :crowberto 400
                                     {:sql                 "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
                                      :template_tag_values {:orderid 5}}))]
      (is (re-find #"declares no `\{\{orderid\}\}` variable" message))
      (is (re-find #"`order_id`" message))))
  (testing "and SQL with no variables at all says so"
    (is (re-find #"no variables at all"
                 (refusal (execute! :crowberto 400 {:sql                 "SELECT 1"
                                                    :template_tag_values {:x 1}}))))))

(deftest a-value-that-is-not-a-scalar-teaches-test
  (testing "the wire schema is what refuses a value that is not a scalar, and it names the types it takes"
    (let [response (execute! :crowberto 400 {:sql                 "SELECT ID FROM ORDERS WHERE ID = {{order_id}}"
                                             :template_tag_values {:order_id {:nested "value"}}})]
      (is (re-find #"string, or number, or boolean"
                   (get-in response [:errors :template_tag_values :order_id]))))))

(deftest a-snippet-reference-takes-no-value-test
  (mt/with-temp [:model/NativeQuerySnippet _ {:name "orders_snippet" :content "ORDERS"}]
    (is (re-find #"is a snippet reference, not a variable"
                 (refusal (execute! :crowberto 400
                                    {:sql                 "SELECT count(*) AS C FROM {{snippet: orders_snippet}}"
                                     :template_tag_values {(keyword "snippet: orders_snippet") "ORDERS"}}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; validate_only — the dry run
;;; ──────────────────────────────────────────────────────────────────

(deftest validate-only-mints-a-handle-and-runs-nothing-test
  ;; The audit row is counted for a user nobody else runs anything as. A global `query_execution` count would
  ;; be moved by any namespace that happens to run a query at the same moment.
  (mt/with-temp [:model/User runner {:is_superuser true}]
    (let [executions (fn [] (t2/count :model/QueryExecution :executor_id (:id runner)))
          response   (mt/with-current-user (:id runner)
                       (execute-sql/execute-sql {:database_id   (mt/id)
                                                 :sql           orders-sql
                                                 :validate_only true}))]
      (testing "the handle is there, and nothing else is — nothing ran"
        (is (= #{:query_handle :validated} (set (keys response))))
        (is (true? (:validated response))))
      (testing "no warehouse query was executed"
        (is (zero? (executions))))
      (testing "and the handle it minted runs, and *that* is audited"
        (is (pos? (:row_count (mt/with-current-user (:id runner)
                                (execute-sql/execute-sql {:query_handle (:query_handle response)})))))
        (is (= 1 (executions)))))))

(deftest validate-only-does-not-validate-the-sql-test
  (testing "only the warehouse can say whether SQL parses, and asking it is running it — so a dry run mints a
            handle for SQL that will fail, which is what v1's `construct_native_query` did"
    (is (true? (:validated (execute! {:sql "SELEKT * FROM ORDERS" :validate_only true})))))
  (testing "but a value for a variable the SQL does not declare is refused, dry run or not"
    (is (re-find #"declares no `\{\{nope\}\}` variable"
                 (refusal (execute! :crowberto 400 {:sql                 orders-sql
                                                    :template_tag_values {:nope 1}
                                                    :validate_only       true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; row_limit and offset
;;; ──────────────────────────────────────────────────────────────────

(deftest row-limit-defaults-to-100-test
  (is (= 100 (:row_count (execute! {:sql orders-sql})))))

(deftest a-row-limit-is-honored-and-capped-test
  (is (= 5 (:row_count (execute! {:sql orders-sql :row_limit 5}))))
  (is (=? {:errors {:row_limit "nullable integer between 1 and 2000 inclusive"}}
          (execute! :crowberto 400 {:sql orders-sql :row_limit 2001}))))

(deftest offset-pages-through-the-handle-test
  (let [page-1 (execute! {:sql orders-sql :row_limit 2})
        page-2 (mt/user-http-request :crowberto :post 200 "agent/v2/execute-sql"
                                     {:query_handle (:query_handle page-1) :row_limit 2 :offset 2})]
    (testing "the first page steers to the next one"
      (is (true? (:truncated page-1)))
      (is (re-find #"offset: 2" (:truncation_message page-1))))
    (testing "and the next page is the next rows — the SQL never re-travels"
      (is (= 2 (:row_count page-2)))
      (is (= [3 4] (mapv first (:rows page-2))))
      (is (= (:query_handle page-1) (:query_handle page-2))))))

(deftest the-last-page-is-not-truncated-test
  (let [response (execute! {:sql "SELECT count(*) AS C FROM ORDERS" :row_limit 10})]
    (is (= 1 (:row_count response)))
    (is (not (contains? response :truncated)))))

(deftest sql-without-an-order-by-says-its-order-is-not-guaranteed-test
  (testing "paging re-reads the query, and two reads of an unordered query need not agree on row order"
    (is (re-find #"no `ORDER BY`"
                 (:truncation_message (execute! {:sql "SELECT ID FROM ORDERS" :row_limit 2}))))
    (is (not (re-find #"no `ORDER BY`"
                      (:truncation_message (execute! {:sql orders-sql :row_limit 2})))))))

(deftest the-row-cap-bounds-how-far-an-offset-reaches-test
  (testing "raw SQL is paged by re-reading it, so the instance's row cap is a ceiling on `offset` — and a page
            that ends at the cap names the SQL-side way on rather than an offset that cannot work"
    (mt/with-temporary-setting-values [unaggregated-query-row-limit 4]
      (let [response (execute! {:sql orders-sql :row_limit 100})]
        (is (= 4 (:row_count response)))
        (is (true? (:truncated response)))
        (is (re-find #"at most 4 rows for one query" (:truncation_message response)))
        (is (re-find #"Add `LIMIT`/`OFFSET`" (:truncation_message response))))
      (testing "and an offset past the cap is refused rather than answered with an empty page"
        (is (re-find #"at most 4 rows for one query"
                     (refusal (execute! :crowberto 400 {:sql orders-sql :row_limit 2 :offset 4}))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Exactly one of sql | query_handle
;;; ──────────────────────────────────────────────────────────────────

(deftest exactly-one-source-test
  (testing "neither"
    (is (re-find #"Provide exactly one of `sql`, `query_handle`"
                 (refusal (mt/user-http-request :crowberto :post 400 "agent/v2/execute-sql" {})))))
  (testing "both"
    (is (re-find #"Provide only one of `sql`, `query_handle`"
                 (refusal (execute! :crowberto 400 {:sql          orders-sql
                                                    :query_handle (str (random-uuid))}))))))

(deftest sql-needs-a-database-test
  (is (re-find #"`database_id` names the database"
               (refusal (mt/user-http-request :crowberto :post 400 "agent/v2/execute-sql" {:sql orders-sql})))))

(deftest a-handle-carries-its-own-database-and-values-test
  (testing "an argument the handle already answers is refused rather than silently ignored"
    (let [handle (:query_handle (execute! {:sql orders-sql}))]
      (is (re-find #"already names its database and its variable values"
                   (refusal (execute! :crowberto 400 {:query_handle handle}))))
      (is (re-find #"already names its database and its variable values"
                   (refusal (mt/user-http-request :crowberto :post 400 "agent/v2/execute-sql"
                                                  {:query_handle        handle
                                                   :template_tag_values {:x 1}})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; response_format
;;; ──────────────────────────────────────────────────────────────────

(deftest response-format-shapes-the-columns-test
  (let [concise  (execute! {:sql orders-sql :row_limit 1})
        detailed (execute! {:sql orders-sql :row_limit 1 :response_format "detailed"})]
    (testing "concise describes a column by the result-column projection, and nothing outside it"
      (is (empty? (remove #{:name :display_name :description :base_type :effective_type :semantic_type}
                          (keys (first (:cols concise)))))))
    (testing "detailed carries every field the query processor knows about it"
      (is (contains? (first (:cols detailed)) :field_ref)))
    (testing "the rows are the same either way"
      (is (= (:rows concise) (:rows detailed))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The two gates
;;; ──────────────────────────────────────────────────────────────────

(deftest native-query-permission-is-required-test
  (testing "the refusal names the permission that is missing, and the tool that runs without it"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (let [message (refusal (execute! :rasta 403 {:sql orders-sql}))]
        (is (re-find #"Native query editing" message))
        (is (re-find #"`execute_query`" message))))))

(deftest the-kill-switch-removes-the-tool-test
  (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
    (testing "the tool is absent from tools/list — a tool the server advertises is a turn the model spends"
      (is (not (contains? (into #{} (map :name) (mcp.tools/list-tools nil)) "execute_sql"))))
    (testing "and a call that reaches the endpoint anyway is refused with the way on"
      (let [message (refusal (execute! :crowberto 403 {:sql orders-sql}))]
        (is (re-find #"Raw SQL is disabled on this instance" message))
        (is (re-find #"`execute_query`" message)))))
  (testing "and it is back when the switch is on"
    (is (contains? (into #{} (map :name) (mcp.tools/list-tools nil)) "execute_sql"))))
