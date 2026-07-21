(ns metabase.mcp.v2.tools.query-test
  "Contract tests for the v2 `execute_query` tool (GHY-4142), driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, nil-arg stripping, Malli validation, and teaching-error conversion are exercised on
   every call. Keyset-cursor mechanics (tiebreaker choice, boundary predicates, bail-out and
   refusal conditions) are owned by [[metabase.mcp.v2.query-test]]; here paging is exercised
   only through the tool's public cursor contract."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.query :as tools.query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private execute-scope
  #{"agent:query:execute"})

(defn- call!
  "Call `execute_query` through the registry dispatch seam as the already-bound current user,
   with the execute scope. Mints a query handle on every successful call."
  [session-id arguments]
  (registry/call-tool execute-scope session-id "execute_query" arguments))

(defn- response-text
  [result]
  (-> result :content first :text))

(defn- payload
  "Parse the JSON payload line of a successful execute_query response. Throws if the tool
   returned an error, so a tool-level error can never masquerade as an empty result."
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

(defn- table-name-ref
  "The `[database schema table]` portable name array for a test-data table."
  [table-kw]
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        table (lib.metadata/table mp (mt/id table-kw))]
    [(:name (lib.metadata/database mp)) (:schema table) (:name table)]))

(defn- field-name-ref
  [table-kw field-kw]
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        field (lib.metadata/field mp (mt/id table-kw field-kw))]
    ["field" {} (conj (table-name-ref table-kw) (:name field))]))

(defn- orders-query
  "A fresh portable MBQL 5 query over ORDERS, optionally with extra stage clauses merged in."
  ([] (orders-query nil))
  ([stage-extra]
   {:lib/type "mbql/query"
    :stages   [(merge {:lib/type     "mbql.stage/mbql"
                       :source-table (table-name-ref :orders)}
                      stage-extra)]}))

(defn- col-index
  [cols col-name]
  (some (fn [[i c]] (when (= (:name c) col-name) i)) (map-indexed vector cols)))

(defn- row-ids
  [{:keys [cols rows]}]
  (let [idx (col-index cols "ID")]
    (mapv #(nth % idx) rows)))

;;; ------------------------------------------------ Happy paths ---------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest execute-query-happy-path-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query (orders-query {:filters [["<=" {} (field-name-ref :orders :id) 3]]})})
            body   (payload result)]
        (testing "GHY-4142: a fresh query returns rows, cols, and counts, and mints a query_handle"
          (is (= 3 (:returned body)))
          (is (= 3 (count (:rows body))))
          (is (false? (:truncated body)))
          (is (string? (:query_handle body)))
          (is (= [1 2 3] (sort (row-ids body)))))
        (testing "GHY-4142: an un-truncated page carries no cursor and no steering line"
          (is (nil? (:next_cursor body)))
          (is (nil? (steering-line result))))
        (testing "GHY-4142: response cols carry only the wire projection — no internal metadata keys"
          (is (seq (:cols body)))
          (doseq [col (:cols body)]
            (is (string? (:name col)))
            (is (string? (:base_type col)))
            (is (empty? (dissoc col :name :base_type :display_name :effective_type))
                "any other key is internal metadata leaking onto the wire")))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest query-handle-rerun-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid   (str (random-uuid))
            args  {:query (orders-query {:filters [["<=" {} (field-name-ref :orders :id) 3]]})}
            first-body (payload (call! sid args))]
        (testing "GHY-4142: re-running a returned query_handle serves exactly the rows the original call served"
          (let [rerun-body (payload (call! sid {:query_handle (:query_handle first-body)}))]
            (is (= (:rows first-body) (:rows rerun-body)))
            (is (string? (:query_handle rerun-body)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest validate-only-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query         (orders-query {:limit 3})
                               :validate_only true})
            body   (payload result)]
        (testing "GHY-4142: validate_only mints a handle without executing"
          (is (= 0 (:returned body)))
          (is (false? (:truncated body)))
          (is (string? (:query_handle body)))
          (is (nil? (:rows body)))
          (is (str/includes? (response-text result) "Query validated, not executed")))
        (testing "GHY-4142: the affordance the message names works — the minted handle executes the validated query"
          (let [run-body (payload (call! sid {:query_handle (:query_handle body)}))]
            (is (= 3 (:returned run-body)))))))))

;;; ------------------------------------------------ Cursor paging -------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest cursor-steering-affordance-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query (orders-query) :row_limit 5})
            body   (payload result)]
        (testing "GHY-4142: a truncated page reports it and steers to the cursor"
          (is (= 5 (:returned body)))
          (is (true? (:truncated body)))
          (is (string? (:next_cursor body)))
          (is (str/includes? (steering-line result) "continue with `cursor`")))
        (testing "GHY-4142: obeying the steering hint makes progress — the cursor serves the next page, same size, no overlap"
          ;; row_limit sizes a cursor page like any other: the cursor carries the boundary, not
          ;; the page size, so a chain that wants a fixed size passes it on every call.
          (let [next-body (payload (call! sid {:cursor (:next_cursor body) :row_limit 5}))]
            (is (= 5 (:returned next-body)))
            (is (empty? (set/intersection (set (row-ids body)) (set (row-ids next-body)))))
            (is (< (apply max (row-ids body)) (apply min (row-ids next-body)))
                "the second page starts strictly past the first page's boundary")))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest cursor-paging-property-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid       (str (random-uuid))
            page-size 5
            n-pages   4
            ids       (loop [args {:query (orders-query) :row_limit page-size}, acc [], pages 0]
                        (let [body (payload (call! sid args))
                              acc' (into acc (row-ids body))]
                          (if (or (>= (inc pages) n-pages) (not (:next_cursor body)))
                            acc'
                            (recur {:cursor (:next_cursor body) :row_limit page-size} acc' (inc pages)))))]
        (testing "GHY-4142: paging by cursor yields strictly increasing, distinct PKs — no row skipped, none repeated"
          (is (= (* page-size n-pages) (count ids)))
          (is (apply < ids))
          (is (= (count ids) (count (distinct ids)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest query-limit-bounds-the-cursor-chain-test
  ;; The query's own :limit bounds the whole result set, not each page. Paging must spend it down
  ;; and stop, never reapply it per page and run off the end of what the caller asked for.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid (str (random-uuid))]
        (testing "GHY-4142: a query exhausted by its own limit is complete, not truncated"
          (let [body (payload (call! sid {:query (orders-query {:limit 3})}))]
            (is (= 3 (:returned body)))
            (is (false? (:truncated body)))
            (is (nil? (:next_cursor body))
                "a cursor here would page past row 3 — rows the caller's limit excluded")))
        (testing "GHY-4142: a limit larger than row_limit pages, but only up to the limit"
          (let [ids (loop [args {:query (orders-query {:limit 12}) :row_limit 5}, acc [], pages 0]
                      (let [body (payload (call! sid args))
                            acc' (into acc (row-ids body))]
                        (if (or (>= pages 5) (not (:next_cursor body)))
                          acc'
                          (recur {:cursor (:next_cursor body) :row_limit 5} acc' (inc pages)))))]
            (is (= 12 (count ids)) "the chain serves exactly the 12 rows the query asked for")
            (is (= (count ids) (count (distinct ids))))
            (is (apply < ids))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest fan-out-join-refuses-cursor-test
  ;; Companion to the refusal contract in metabase.mcp.v2.query-test: at the tool surface a
  ;; truncated fan-out page must be an explicit dead end — truncated with no next_cursor,
  ;; steered to narrowing — never a cursor that would page with silent gaps.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            mp     (lib-be/application-database-metadata-provider (mt/id))
            p-id   (lib.metadata/field mp (mt/id :products :id))
            o-pid  (lib.metadata/field mp (mt/id :orders :product_id))
            joined (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                       (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :orders))
                                                  [(lib/= p-id o-pid)])))
            handle (common/mint-query-handle! sid (mt/user->id :rasta)
                                              (common/encode-serialized-query
                                               (lib/prepare-for-serialization joined)))
            ;; row_limit, not an embedded :limit — a query the caller limited to 5 rows that
            ;; returns 5 is complete, and the truncation this pins has to come from the page cap.
            result (call! sid {:query_handle handle :row_limit 5})
            body   (payload result)]
        (testing "GHY-4142: a truncated fan-out join page is an explicit dead end, not a gapped cursor"
          (is (= 5 (:returned body)))
          (is (true? (:truncated body)))
          (is (nil? (:next_cursor body)))
          (is (str/includes? (steering-line result) "narrow the query")))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest aggregated-query-cursor-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid      (str (random-uuid))
            agg-args {:query (orders-query {:aggregation [["count" {}]]
                                            :breakout    [(field-name-ref :orders :user_id)]
                                            :order-by    [["asc" {} (field-name-ref :orders :user_id)]]})
                      :row_limit 5}
            body     (payload (call! sid agg-args))]
        (testing "GHY-4142: a truncated aggregated page pages through an appended-stage cursor"
          (is (= 5 (:returned body)))
          (is (true? (:truncated body)))
          (is (string? (:next_cursor body)))
          (let [uid-idx   (col-index (:cols body) "USER_ID")
                next-body (payload (call! sid {:cursor (:next_cursor body)}))]
            ;; The aggregated cursor carries no embedded page size (an in-stage limit would cut
            ;; the base set pre-aggregation), so the next page sizes by its own row_limit.
            (is (pos? (:returned next-body)))
            (is (< (apply max (map #(nth % uid-idx) (:rows body)))
                   (apply min (map #(nth % uid-idx) (:rows next-body))))
                "the second page of groups starts strictly past the first page's boundary")))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest prompt-rides-the-cursor-chain-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid  (str (random-uuid))
            uid  (mt/user->id :rasta)
            body (payload (call! sid {:query     (orders-query)
                                      :row_limit 5
                                      :prompt    "show me all orders"}))]
        (testing "GHY-4142: a cursor minted without its own prompt keeps the original request for the feedback flow"
          (is (= "show me all orders"
                 (:prompt (common/resolve-query-handle! sid uid (:next_cursor body)))))
          (is (= "show me all orders"
                 (:prompt (common/resolve-query-handle! sid uid (:query_handle body))))))))))

;;; ------------------------------------------------ Teaching errors -----------------------------------------------

(deftest ^:parallel input-exclusivity-test
  ;; Error paths mint nothing, so these calls go straight through registry/call-tool and stay
  ;; ^:parallel; the minting tests above use the call! helper plus model cleanup instead.
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid      (str (random-uuid))
          expected "Pass exactly one of query | query_handle | cursor"]
      (testing "GHY-4142: no query input at all is a teaching error naming the three options"
        (is (str/starts-with? (error-text (registry/call-tool execute-scope sid "execute_query" {}))
                              expected)))
      (testing "GHY-4142: two query inputs at once is the same teaching error"
        (is (str/starts-with? (error-text (registry/call-tool execute-scope sid "execute_query"
                                                              {:query        (orders-query)
                                                               :query_handle "some-handle"}))
                              expected)))
      (testing "GHY-4142: the teaching error is a 400, not a downstream 500"
        (let [e (try
                  (tools.query/execute-query {} {:session-id sid})
                  (catch Exception e e))]
          (is (= 400 (:status-code (ex-data e)))))))))

(deftest ^:parallel native-query-rejection-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))]
      (testing "GHY-4142: a native stage is rejected up front with the execute_sql steer"
        (is (= "Native queries are not supported here; use execute_sql instead."
               (error-text (registry/call-tool execute-scope sid "execute_query"
                                               {:query {:lib/type "mbql/query"
                                                        :stages   [{:lib/type "mbql.stage/native"
                                                                    :native   "SELECT 1"}]}}))))))))

(deftest ^:parallel row-limit-validation-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))]
      (doseq [bad [0 2001]]
        (testing (format "GHY-4142: row_limit %d fails schema validation with a teaching-style message" bad)
          (let [text (error-text (registry/call-tool execute-scope sid "execute_query"
                                                     {:query (orders-query) :row_limit bad}))]
            (is (str/starts-with? text "Invalid arguments"))
            (is (str/includes? text "row_limit"))))))))

;;; --------------------------------------------- Handles and security ---------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest handle-existence-collapse-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [sid            (str (random-uuid))
          foreign-handle (common/mint-query-handle! sid (mt/user->id :crowberto)
                                                    (common/encode-serialized-query
                                                     (orders-query {:limit 1})))
          fetch-error    (fn [handle]
                           (mt/with-current-user (mt/user->id :rasta)
                             (error-text (call! sid {:query_handle handle}))))]
      (testing "GHY-4142: another user's real handle and a nonexistent handle yield string-identical errors — no existence oracle"
        (let [nonexistent-msg (fetch-error (str (random-uuid)))
              foreign-msg     (fetch-error foreign-handle)]
          (is (= nonexistent-msg foreign-msg))
          (is (= "Query handle not found — it may have expired; run the query again." foreign-msg))))
      (testing "GHY-4142: the cursor path collapses identically"
        (is (= (mt/with-current-user (mt/user->id :rasta)
                 (error-text (call! sid {:cursor foreign-handle})))
               (mt/with-current-user (mt/user->id :rasta)
                 (error-text (call! sid {:cursor (str (random-uuid))})))))))))

(deftest ^:parallel scope-gating-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))]
      (testing "GHY-4142: a token without the execute scope is denied"
        (let [result (registry/call-tool #{"agent:search"} sid "execute_query" {})]
          (is (:isError result))
          (is (= "Insufficient scope to call tool: execute_query" (response-text result)))))
      (testing "GHY-4142: the identical call with the execute scope reaches the handler (positive control)"
        ;; It fails input validation — proof it got past the scope gate without minting anything.
        (is (str/starts-with? (error-text (registry/call-tool execute-scope sid "execute_query" {}))
                              "Pass exactly one of"))))))

(deftest ^:parallel scope-advertisement-test
  (testing "GHY-4142: the execute scope is grantable — advertised via registered-scopes"
    (is (contains? (registry/registered-scopes) "agent:query:execute")))
  (testing "GHY-4142: tools/list visibility follows the scope on both sides"
    (is (some #(= "execute_query" (:name %)) (registry/list-tools #{"agent:query:execute"})))
    (is (not (some #(= "execute_query" (:name %)) (registry/list-tools #{"agent:search"})))))
  (testing "GHY-4142: the tool advertises itself read-only"
    (let [tool (first (filter #(= "execute_query" (:name %)) (registry/list-tools nil)))]
      (is (true? (get-in tool [:annotations :readOnlyHint]))))))
