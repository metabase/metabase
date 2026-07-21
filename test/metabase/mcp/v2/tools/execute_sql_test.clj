(ns metabase.mcp.v2.tools.execute-sql-test
  "Contract tests for the v2 `execute_sql` tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, nil-arg stripping, Malli validation, and teaching-error conversion are exercised on
   every call. Handle ownership and store-level guards are owned by
   [[metabase.mcp.v2.common-test]]; `execute_query`'s MBQL/cursor contract by its own suite —
   neither is re-covered here."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.query :as tools.query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private sql-scope
  #{"agent:sql:execute"})

(defn- call!
  "Call `tool-name` (default `execute_sql`) through the registry dispatch seam as the
   already-bound current user, carrying `scopes` the way a bearer token would."
  ([session-id arguments] (call! session-id "execute_sql" arguments))
  ([session-id tool-name arguments] (call! session-id tool-name arguments sql-scope))
  ([session-id tool-name arguments scopes]
   (registry/call-tool scopes session-id tool-name arguments)))

(defn- response-text
  [result]
  (-> result :content first :text))

(defn- payload
  "Parse the JSON payload line of a successful response. Throws if the tool returned an
   error, so a tool-level error can never masquerade as an empty result."
  [result]
  (when (:isError result)
    (throw (ex-info "expected success, got tool error" {:result result})))
  (-> result response-text str/split-lines first json/decode+kw))

(defn- steering-line
  "The steering sentence appended after the JSON payload, or nil on an unsteered response.
   Throws on a tool-level error for the same reason as [[payload]]."
  [result]
  (when (:isError result)
    (throw (ex-info "expected success, got tool error" {:result result})))
  (second (str/split-lines (response-text result))))

(defn- error-text
  "The error message of a tool-level error response. Throws if the call succeeded, so a
   passing call can never satisfy an error assertion."
  [result]
  (when-not (:isError result)
    (throw (ex-info "expected tool error, got success" {:result result})))
  (response-text result))

(defn- stored-query
  "Decode the serialized query a handle stores, exactly as downstream consumers will read it."
  [session-id user-id handle]
  (-> (mcp.session/resolve-query-handle session-id user-id handle)
      :encoded_query
      u/decode-base64
      json/decode+kw))

(defn- count-value
  "The single count cell of a `SELECT count(*) …` payload."
  [body]
  (-> body :rows first first))

;;; ------------------------------------------------ Happy paths ---------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-happy-path-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str "execute-sql-happy-" (random-uuid))
            result (call! sid {:database_id (mt/id)
                               :row_limit   3
                               :sql         "SELECT ID, TOTAL FROM ORDERS ORDER BY ID"})
            body   (payload result)]
        (testing "rows arrive in the dataset shape, capped at row_limit, with a minted handle"
          (is (= 3 (:returned body)))
          (is (= 3 (count (:rows body))))
          (is (true? (:truncated body)))
          (is (string? (:query_handle body)))
          (is (= ["ID" "TOTAL"] (mapv :name (:cols body)))))
        (testing "response cols carry only the wire projection — no internal metadata keys"
          (doseq [col (:cols body)]
            (is (string? (:base_type col)))
            (is (empty? (dissoc col :name :base_type :display_name :effective_type))
                "any other key is internal metadata leaking onto the wire")))
        (testing "a truncated page steers to narrowing the SQL — SQL results never mint a cursor"
          (is (not (contains? body :next_cursor)))
          (is (= "returned 3 rows — narrow the SQL (add filters/aggregation) or export for the full set"
                 (steering-line result))))
        (testing "the response is text-only; there is no structuredContent channel to diverge from it"
          (is (nil? (:structuredContent result))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-truncation-signal-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str "execute-sql-trunc-" (random-uuid))
            result (call! sid {:database_id (mt/id)
                               :row_limit   100
                               :sql         "SELECT ID FROM ORDERS ORDER BY ID LIMIT 5"})
            body   (payload result)]
        (testing "a page under row_limit is not truncated and carries no steering line"
          (is (= 5 (:returned body)))
          (is (false? (:truncated body)))
          (is (nil? (steering-line result))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-exact-fill-is-not-truncated-test
  (testing "a result whose size exactly equals row_limit is complete, not truncated — the tool
            fetches one row past the limit so truncation is observed rather than inferred from a
            full page. Mis-reporting it would steer the agent to narrow SQL that was already
            right, and execute_sql mints no cursor that could correct the mistake."
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [sid    (str "execute-sql-exact-" (random-uuid))
              result (call! sid {:database_id (mt/id)
                                 :row_limit   5
                                 :sql         "SELECT ID FROM ORDERS ORDER BY ID LIMIT 5"})
              body   (payload result)]
          (is (= 5 (:returned body)))
          (is (= 5 (count (:rows body))))
          (is (false? (:truncated body)))
          (is (nil? (steering-line result))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-probe-row-not-served-test
  (testing "the extra row fetched to detect truncation is dropped, never served: a truncated
            page holds exactly row_limit rows and stops at the row_limit'th value"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [sid  (str "execute-sql-probe-" (random-uuid))
              body (payload (call! sid {:database_id (mt/id)
                                        :row_limit   3
                                        :sql         "SELECT ID FROM ORDERS ORDER BY ID LIMIT 10"}))]
          (is (= 3 (:returned body)))
          (is (true? (:truncated body)))
          (is (= [[1] [2] [3]] (:rows body))))))))

;;; --------------------------------------------- Template tag values ----------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-template-tag-binding-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid        (str "execute-sql-tags-" (random-uuid))
            count-sql  "SELECT count(*) AS C FROM ORDERS WHERE TOTAL > {{min_total}}"
            full-count (count-value (payload (call! sid {:database_id (mt/id)
                                                         :sql "SELECT count(*) AS C FROM ORDERS"})))]
        (testing "a numeric value binds as a numeric parameter and filters rows"
          (is (= full-count (count-value (payload (call! sid {:database_id         (mt/id)
                                                              :sql                 count-sql
                                                              :template_tag_values {:min_total -1e9}})))))
          (is (zero? (count-value (payload (call! sid {:database_id         (mt/id)
                                                       :sql                 count-sql
                                                       :template_tag_values {:min_total 1e9}}))))))
        (testing "an injection-shaped string binds as a parameter value, never spliced into the SQL"
          ;; bound as a value it fails the numeric comparison's typing; spliced it would have
          ;; returned the full count
          (is (str/starts-with? (error-text (call! sid {:database_id         (mt/id)
                                                        :sql                 count-sql
                                                        :template_tag_values {:min_total "0 OR 1=1"}}))
                                "Query failed:")))
        (testing "a boolean value binds as a boolean parameter"
          (is (zero? (count-value (payload (call! sid {:database_id         (mt/id)
                                                       :sql                 "SELECT count(*) AS C FROM ORDERS WHERE {{flag}}"
                                                       :template_tag_values {:flag false}}))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-template-tag-teaching-errors-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid (str "execute-sql-tag-errors-" (random-uuid))]
        (testing "a value naming no {{tag}} in the SQL is a teaching error listing the tags that exist"
          (let [msg (error-text (call! sid {:database_id         (mt/id)
                                            :sql                 "SELECT count(*) AS C FROM ORDERS WHERE TOTAL > {{min_total}}"
                                            :template_tag_values {:nope 1}}))]
            (is (str/includes? msg "No {{nope}} template tag"))
            (is (str/includes? msg "Tags found: min_total"))))
        (testing "with no tags in the SQL at all, the error says so"
          (is (str/includes? (error-text (call! sid {:database_id         (mt/id)
                                                     :sql                 "SELECT 1"
                                                     :template_tag_values {:nope 1}}))
                             "Tags found: none")))
        (testing "snippet tags cannot be populated — they splice server-side SQL text"
          (is (str/includes? (error-text (call! sid {:database_id         (mt/id)
                                                     :sql                 "SELECT * FROM ORDERS WHERE {{snippet: my filter}}"
                                                     :template_tag_values {(keyword "snippet: my filter") "x"}}))
                             "snippet-reference tag")))
        (testing "card-reference tags cannot be populated — they splice server-side SQL text"
          (is (str/includes? (error-text (call! sid {:database_id         (mt/id)
                                                     :sql                 "SELECT * FROM {{#123-some-card}}"
                                                     :template_tag_values {(keyword "#123-some-card") "x"}}))
                             "card-reference tag")))))))

;;; ------------------------------------------------ validate_only -------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-validate-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid (str "execute-sql-validate-" (random-uuid))
            uid (mt/user->id :crowberto)]
        (testing "validate_only mints a handle without executing — even unrunnable SQL is accepted"
          (let [sql    "SELECT FROM WHERE kaboom"
                result (call! sid {:database_id (mt/id) :sql sql :validate_only true})
                body   (payload result)]
            (is (= {:returned 0 :truncated false} (select-keys body [:returned :truncated])))
            (is (not (contains? body :rows)))
            (is (not (contains? body :cols)))
            (is (str/includes? (response-text result) "not executed"))
            (testing "the handle stores the SQL verbatim"
              (is (= sql (-> (stored-query sid uid (:query_handle body)) :stages first :native))))))
        (testing "the handle carries bound template-tag values, so a later run reproduces this one"
          (let [result (call! sid {:database_id         (mt/id)
                                   :sql                 "SELECT count(*) AS C FROM ORDERS WHERE TOTAL > {{min_total}}"
                                   :template_tag_values {:min_total 7}
                                   :validate_only       true})
                stored (stored-query sid uid (:query_handle (payload result)))]
            (is (= [{:type "number" :target ["variable" ["template-tag" "min_total"]] :value 7}]
                   (:parameters stored)))
            (is (= "number" (-> stored :stages first :template-tags first :type)))))))))

;;; ---------------------------------------------------- Gates -----------------------------------------------------

;; not ^:parallel: mt/with-temporary-setting-values on the shared kill-switch setting
(deftest execute-sql-kill-switch-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
      (let [sid (str "execute-sql-kill-" (random-uuid))]
        (testing "the kill switch refuses execution and names the setting that re-enables it"
          (is (str/includes? (error-text (call! sid {:database_id (mt/id) :sql "SELECT 1"}))
                             "mcp-execute-sql-enabled")))
        (testing "validate_only is refused identically — it is not a kill-switch bypass"
          (is (str/includes? (error-text (call! sid {:database_id (mt/id) :sql "SELECT 1" :validate_only true}))
                             "mcp-execute-sql-enabled")))
        (testing "no handle is minted on either refused path"
          (is (zero? (t2/count :model/McpQueryHandle :mcp_session_id sid))))))))

;; not ^:parallel: rebinds the shared data-perms graph
(deftest execute-sql-native-permission-test
  (let [args {:database_id (mt/id) :sql "SELECT count(*) AS C FROM ORDERS"}]
    (testing "a user who can browse the database but lacks native permission gets the permission error"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder}}
        (mt/with-current-user (mt/user->id :rasta)
          (let [sid (str "execute-sql-perms-" (random-uuid))]
            (is (str/includes? (error-text (call! sid args))
                               "permission to run native queries"))
            (testing "validate_only is refused identically, and neither path mints a handle"
              (is (str/includes? (error-text (call! sid (assoc args :validate_only true)))
                                 "permission to run native queries"))
              (is (zero? (t2/count :model/McpQueryHandle :mcp_session_id sid))))))))
    (testing "granting native permission makes the identical call succeed"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder-and-native}}
        (mt/with-current-user (mt/user->id :rasta)
          (mt/with-model-cleanup [:model/McpQueryHandle]
            (let [body (payload (call! (str "execute-sql-perms-ok-" (random-uuid)) args))]
              (is (= 1 (:returned body))))))))))

;; not ^:parallel: rebinds the shared data-perms graph
(deftest execute-sql-existence-collapse-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-current-user (mt/user->id :rasta)
      (let [sid       (str "execute-sql-oracle-" (random-uuid))
            normalize #(str/replace % #"\d+" "<id>")
            denied    (error-text (call! sid {:database_id (mt/id) :sql "SELECT 1"}))
            missing   (error-text (call! sid {:database_id Integer/MAX_VALUE :sql "SELECT 1"}))]
        (testing "an unreadable database and a nonexistent one yield string-identical not-found errors"
          (is (= (normalize denied) (normalize missing)))
          (is (str/includes? denied "not found")))
        (testing "the refused validate_only path mints no handle"
          (error-text (call! sid {:database_id (mt/id) :sql "SELECT 1" :validate_only true}))
          (is (zero? (t2/count :model/McpQueryHandle :mcp_session_id sid))))))))

;; not ^:parallel: mt/with-temporary-setting-values and rebound data perms
(deftest execute-sql-gate-status-codes-test
  (let [gate-ex-data (fn [database-id]
                       (try
                         (#'tools.query/check-execute-sql-gates! database-id)
                         nil
                         (catch clojure.lang.ExceptionInfo e (ex-data e))))]
    ;; the user binding sits inside each perms block: binding it once around all three would
    ;; freeze the per-user permissions cache before the perms macros change the graph
    (testing "the kill switch refuses with a 403"
      (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
        (mt/with-current-user (mt/user->id :rasta)
          (is (= 403 (:status-code (gate-ex-data (mt/id))))))))
    (testing "an invisible database is a 404, whether it exists or not"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (is (= 404 (:status-code (gate-ex-data (mt/id)))))
          (is (= 404 (:status-code (gate-ex-data Integer/MAX_VALUE)))))))
    (testing "a browsable database without native permission is a 403"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder}}
        (mt/with-current-user (mt/user->id :rasta)
          (is (= 403 (:status-code (gate-ex-data (mt/id))))))))))

;;; ------------------------------------------------ Handle contract -----------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-handle-rejected-by-execute-query-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str "execute-sql-handle-" (random-uuid))
            handle (:query_handle (payload (call! sid {:database_id   (mt/id)
                                                       :sql           "SELECT 1"
                                                       :validate_only true})))]
        (testing "execute_query refuses an execute_sql handle and steers back to execute_sql"
          (is (= "Native queries are not supported here; use execute_sql instead."
                 (error-text (call! sid "execute_query" {:query_handle handle}
                                    #{"agent:query:execute"})))))))))

;;; ---------------------------------------------------- Scope -----------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-sql-scope-test
  (testing "the tool's scope is advertised, so a token can actually be granted it"
    (is (contains? (registry/registered-scopes) "agent:sql:execute")))
  (testing "scope gating holds on both surfaces: tools/list and tools/call"
    (let [listed-names #(into #{} (map :name) (registry/list-tools %))]
      (is (contains? (listed-names sql-scope) "execute_sql"))
      (is (not (contains? (listed-names #{"agent:query:execute"}) "execute_sql")))))
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sid  (str "execute-sql-scope-" (random-uuid))
          args {:database_id (mt/id) :sql "SELECT 1"}]
      (testing "a token holding only execute_query's scope cannot call execute_sql"
        (is (str/includes? (error-text (call! sid "execute_sql" args #{"agent:query:execute"}))
                           "Insufficient scope")))
      (testing "the identical call succeeds with the SQL-execute scope"
        (mt/with-model-cleanup [:model/McpQueryHandle]
          (is (= 1 (:returned (payload (call! sid args))))))))))

;;; ------------------------------------------------- Validation ---------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup guards against a validation bug minting handles
(deftest execute-sql-argument-validation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid (str "execute-sql-args-" (random-uuid))]
        (testing "row_limit above the cap is a validation error naming the argument"
          (is (str/includes? (error-text (call! sid {:database_id (mt/id)
                                                     :sql         "SELECT 1"
                                                     :row_limit   2001}))
                             "row_limit")))
        (testing "sql is required"
          (is (str/includes? (error-text (call! sid {:database_id (mt/id)}))
                             "sql")))))))

(deftest ^:parallel value->tag-type-test
  (testing "template-tag types are derived from the JSON value type"
    (is (= :number (#'tools.query/value->tag-type 1)))
    (is (= :number (#'tools.query/value->tag-type 1.5)))
    (is (= :boolean (#'tools.query/value->tag-type true)))
    (is (= :boolean (#'tools.query/value->tag-type false)))
    (is (= :text (#'tools.query/value->tag-type "x")))))
