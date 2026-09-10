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
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content]
   [metabase.mcp.v2.tools.query :as tools.query]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; required for its side effect: registering `get_content`, which the definition round-trip drives.
(comment metabase.mcp.v2.tools.content/keep-me)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private execute-scope
  #{"agent:query:run"})

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

(defn- orders-card-query
  "A Lib query over ORDERS for a card fixture's stored `:dataset_query`. Distinct from
   [[orders-query]], which builds the tool-input shape a caller sends rather than a stored query."
  []
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- col-index
  [cols col-name]
  (some (fn [[i c]] (when (= (:name c) col-name) i)) (map-indexed vector cols)))

(defn- row-ids
  [{:keys [cols rows]}]
  (let [idx (col-index cols "ID")]
    (mapv #(nth % idx) rows)))

(tx/defdataset big-ids
  "Key values straddling the JS-safe integer boundary, 2^53-1 = 9007199254740991. Every
   execute_query run carries `js-int-to-string?`, which renders anything past that boundary as a
   STRING rather than a number, so these rows exercise a cursor boundary that arrives as text
   while the column it is compared against stays numeric. The first two rows sit at or below the
   boundary and page as ordinary numbers; the rest cross it."
  [["big_ids"
    [{:field-name "big_id" :base-type :type/BigInteger}]
    [[9007199254740989]
     [9007199254740991]
     [9007199254740993]
     [9007199254740995]
     [9007199254740997]
     [9007199254741001]]]])

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
(deftest exact-fill-is-not-truncated-test
  ;; Companion to query-limit-bounds-the-cursor-chain-test, which pins the same property when the
  ;; query's own :limit is what runs out. Here nothing but the result set itself is exhausted:
  ;; PRODUCTS has exactly 4 categories, so a 4-row page at row_limit 4 is complete. The tool
  ;; fetches one row past row_limit, so truncation is observed rather than inferred from a full
  ;; page — inferring it would mint a cursor whose next page is always empty.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid   (str (random-uuid))
            query {:lib/type "mbql/query"
                   :stages   [{:lib/type     "mbql.stage/mbql"
                               :source-table (table-name-ref :products)
                               :aggregation  [["count" {}]]
                               :breakout     [(field-name-ref :products :category)]}]}]
        (testing "GHY-4142: a result set exactly filling row_limit is complete, not truncated"
          (let [result (call! sid {:query query :row_limit 4})
                body   (payload result)]
            (is (= 4 (:returned body)))
            (is (false? (:truncated body)))
            (is (nil? (:next_cursor body))
                "a cursor here would page onto an empty result")
            (is (nil? (steering-line result)))))
        (testing "GHY-4142: one row short of the same result set still pages"
          (let [body (payload (call! sid {:query query :row_limit 3}))]
            (is (= 3 (:returned body)))
            (is (true? (:truncated body)))
            (is (some? (:next_cursor body)))))))))

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
            handle (v2.queries/mint-query-handle! sid (mt/user->id :rasta)
                                                  (v2.queries/encode-serialized-query
                                                   (lib/prepare-for-serialization joined)))
            ;; row_limit, not an embedded :limit — a query the caller limited to 5 rows that
            ;; returns 5 is complete, and the truncation this pins has to come from the page cap.
            result (call! sid {:query_handle handle :row_limit 5})
            body   (payload result)]
        (testing "GHY-4142: a truncated fan-out join page is an explicit dead end, not a gapped cursor"
          (is (= 5 (:returned body)))
          (is (true? (:truncated body)))
          (is (nil? (:next_cursor body)))
          (is (str/includes? (steering-line result) "narrow the query"))
          (testing "the dead end names an affordance that exists"
            (is (str/includes? (steering-line result) "raise `row_limit`"))
            (is (not (str/includes? (steering-line result) "export"))
                "no export tool exists in v2 — steering at one sends the agent after an affordance it does not have"))
          (testing "and does not suggest paging by hand — a keyset over a fan-out join is exactly
                    the gapped pagination this dead end exists to prevent, so the hint execute_sql
                    gives must not leak onto the MBQL path"
            (is (not (str/includes? (steering-line result) "ORDER BY")))))))))

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
(deftest non-unique-projection-refuses-cursor-test
  ;; GHY-4363: a projection with no unique key has no total order. The full-tuple tiebreaker ties
  ;; on every duplicate row, and a strictly-past-the-boundary keyset then skips every row tied
  ;; with the boundary. PRODUCTS holds 200 rows across 4 categories, so a CATEGORY-only
  ;; projection that minted a cursor would serve 4 pages, drop 180 rows, and report itself
  ;; complete — the exact silent gap the cursor contract exists to prevent.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            query  {:lib/type "mbql/query"
                    :stages   [{:lib/type     "mbql.stage/mbql"
                                :source-table (table-name-ref :products)
                                :fields       [(field-name-ref :products :category)]}]}
            result (call! sid {:query query :row_limit 5})
            body   (payload result)]
        (testing "GHY-4363: a projection without a unique key is an explicit dead end, not a cursor"
          (is (= 5 (:returned body)))
          (is (true? (:truncated body)))
          (is (nil? (:next_cursor body)))
          (is (not (str/includes? (steering-line result) "continue with `cursor`"))
              "offering a cursor affordance with no cursor would strand the agent")
          (is (str/includes? (steering-line result) "narrow the query")))
        (testing "GHY-4363: projecting the PK alongside restores the cursor — the refusal is about uniqueness, not about `fields`"
          (let [with-pk (assoc-in query [:stages 0 :fields]
                                  [(field-name-ref :products :id)
                                   (field-name-ref :products :category)])
                pk-body (payload (call! sid {:query with-pk :row_limit 5}))]
            (is (true? (:truncated pk-body)))
            (is (string? (:next_cursor pk-body)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest aggregated-cursor-chain-continues-past-the-appended-stage-test
  ;; GHY-4363: page 1 of an aggregated chain appends a stage to carry the keyset, so every later
  ;; page reads a query whose LAST stage is that appended one — unaggregated, with no projected
  ;; PK. The uniqueness proof has to look back through it to the aggregating stage; a proof that
  ;; only inspects the last stage kills the chain at page 2.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid       (str (random-uuid))
            page-size 3
            n-pages   4
            uids      (loop [args  {:query (orders-query {:aggregation [["count" {}]]
                                                          :breakout    [(field-name-ref :orders :user_id)]
                                                          :order-by    [["asc" {} (field-name-ref :orders :user_id)]]})
                                    :row_limit page-size}
                             acc   []
                             pages 0]
                        (let [body (payload (call! sid args))
                              idx  (col-index (:cols body) "USER_ID")
                              acc' (into acc (map #(nth % idx) (:rows body)))]
                          (if (or (>= (inc pages) n-pages) (not (:next_cursor body)))
                            acc'
                            (recur {:cursor (:next_cursor body) :row_limit page-size} acc' (inc pages)))))]
        (testing "GHY-4363: an aggregated chain keeps paging past the appended stage, with no gaps or repeats"
          (is (= (* page-size n-pages) (count uids)))
          (is (apply < uids) "strictly increasing => no boundary repeats and no groups skipped")
          (is (= (count uids) (count (distinct uids)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest large-integer-boundary-paging-test
  ;; GHY-4363: the cursor boundary is read straight out of the row that was served, and
  ;; `js-int-to-string?` has already turned any integer past 2^53-1 into a string by then — so the
  ;; minted predicate really does compare a numeric column against a string literal. It compiles
  ;; correctly only because the query processor re-types it on the way in:
  ;; `wrap-value-literals` gives the bare literal the column's effective type and
  ;; `auto-parse-filter-values` parses it back to a bigint, both above the driver layer, so every
  ;; driver sees a number. That dependency is invisible from the cursor code and nothing else
  ;; pins it — pin it here, across the threshold, in one exact chain.
  (mt/dataset big-ids
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [sid   (str (random-uuid))
              query {:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table (table-name-ref :big_ids)
                                 :order-by     [["asc" {} (field-name-ref :big_ids :big_id)]]}]}
              seen  (loop [args {:query query :row_limit 2}, acc [], pages 0]
                      (let [body (payload (call! sid args))
                            idx  (col-index (:cols body) "BIG_ID")
                            acc' (into acc (map #(nth % idx) (:rows body)))]
                        (if (or (>= pages 10) (not (:next_cursor body)))
                          acc'
                          (recur {:cursor (:next_cursor body) :row_limit 2} acc' (inc pages)))))]
          (testing "GHY-4363: every row is served exactly once across a boundary that crosses 2^53"
            ;; compared as strings: the rows below the boundary come back as numbers and the ones
            ;; past it as strings, which is the whole point.
            (is (= ["9007199254740989" "9007199254740991" "9007199254740993"
                    "9007199254740995" "9007199254740997" "9007199254741001"]
                   (mapv str seen)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest remapped-column-paging-test
  ;; The remap middleware injects a display column into every row (PEOPLE.NAME beside
  ;; ORDERS.USER_ID), so the row no longer matches the projection position for position.
  ;; next-page-query has to drop the injected columns before reading the boundary; misalignment
  ;; would read some other column's value and page from a boundary that was never served.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-column-remappings [orders.user_id people.name]
        (let [sid       (str (random-uuid))
              ordered-by (fn [field-kw]
                           {:query     (orders-query {:order-by [["asc" {} (field-name-ref :orders field-kw)]]})
                            :row_limit 5})]
          (testing "GHY-4142: a remapped column in the projection doesn't defeat the boundary read — the cursor still pages"
            (let [body (payload (call! sid (ordered-by :id)))]
              (is (true? (:truncated body)))
              (is (string? (:next_cursor body)))
              (let [next-body (payload (call! sid {:cursor (:next_cursor body) :row_limit 5}))]
                (is (empty? (set/intersection (set (row-ids body)) (set (row-ids next-body))))
                    "an overlap would mean the boundary was read from the wrong row position")
                (is (< (apply max (row-ids body)) (apply min (row-ids next-body)))))))
          (testing "GHY-4142: ordering by the remapped column mints no cursor — the middleware sorts by display value while the keyset predicate compares raw ones"
            (let [body (payload (call! sid (ordered-by :user_id)))]
              (is (true? (:truncated body)))
              (is (nil? (:next_cursor body))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest row-limit-caps-the-page-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid (str (random-uuid))]
        (testing "GHY-4142: row_limit caps a query that would otherwise return the whole table"
          (let [body (payload (call! sid {:query (orders-query) :row_limit 7}))]
            (is (= 7 (:returned body)))
            (is (= 7 (count (:rows body))))
            (is (true? (:truncated body)))))
        (testing "GHY-4142: the query's own limit binds when it is the smaller of the two"
          (let [body (payload (call! sid {:query (orders-query {:limit 2}) :row_limit 7}))]
            (is (= 2 (:returned body)))
            (is (false? (:truncated body)))))
        (testing "GHY-4142: an unbounded query with no row_limit is capped at the default, not run to completion"
          (let [body (payload (call! sid {:query (orders-query)}))]
            (is (= 100 (:returned body)))
            (is (true? (:truncated body)))))))))

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
                 (:prompt (v2.queries/resolve-query-handle! sid uid (:next_cursor body)))))
          (is (= "show me all orders"
                 (:prompt (v2.queries/resolve-query-handle! sid uid (:query_handle body))))))))))

;;; ------------------------------------------------ Teaching errors -----------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest cursor-page-handle-carries-no-page-boundary-test
  ;; GHY-4363: a cursor page's stored query embeds the keyset boundary it resumed from — that is
  ;; how paging works at all. But the handle the response hands back is what `question_write`
  ;; saves and what the UI visualizes, and a boundary is a scroll position, not part of the
  ;; question: saving page 3 must save "orders", never "orders from row 4171 onward". The cursor
  ;; keeps its boundary; the handle does not.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            stored (fn [handle]
                     (:query (v2.queries/resolve-query-handle! sid (mt/user->id :rasta) handle)))
            page1  (payload (call! sid {:query (orders-query) :row_limit 5}))
            page2  (payload (call! sid {:cursor (:next_cursor page1) :row_limit 5}))
            page3  (payload (call! sid {:cursor (:next_cursor page2) :row_limit 5}))]
        (testing "the chain really did resume from a boundary — otherwise this pins nothing"
          (is (< (apply max (row-ids page1)) (apply min (row-ids page3)))))
        (testing "GHY-4363: the deep page's handle carries no page boundary"
          (is (empty? (:filters (last (:stages (stored (:query_handle page3))))))))
        (testing "GHY-4363: so re-running it serves the question from the top, not the page again"
          (let [rerun (payload (call! sid {:query_handle (:query_handle page3)}))]
            (is (= (row-ids page1) (vec (take 5 (row-ids rerun)))))))
        (testing "GHY-4363: a filter the caller wrote is part of the question and survives"
          (let [f1 (payload (call! sid {:query     (orders-query {:filters [[">" {} (field-name-ref :orders :id) 100]]})
                                        :row_limit 5}))
                f2 (payload (call! sid {:cursor (:next_cursor f1) :row_limit 5}))
                fs (:filters (last (:stages (stored (:query_handle f2)))))]
            (is (= 1 (count fs)) "the caller's clause, and only it")
            (is (= ">" (ffirst fs)))))))))

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
          foreign-handle (v2.queries/mint-query-handle! sid (mt/user->id :crowberto)
                                                        (v2.queries/encode-serialized-query
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
        (let [result (registry/call-tool #{"agent:content:read"} sid "execute_query" {})]
          (is (:isError result))
          (is (= "Insufficient scope to call tool: execute_query" (response-text result)))))
      (testing "GHY-4142: the identical call with the execute scope reaches the handler (positive control)"
        ;; It fails input validation — proof it got past the scope gate without minting anything.
        (is (str/starts-with? (error-text (registry/call-tool execute-scope sid "execute_query" {}))
                              "Pass exactly one of"))))))

(deftest ^:parallel scope-advertisement-test
  (testing "GHY-4142: the execute scope is grantable — advertised via registered-scopes"
    (is (contains? (registry/registered-scopes) "agent:query:run")))
  (testing "GHY-4142: tools/list visibility follows the scope on both sides"
    (is (some #(= "execute_query" (:name %)) (registry/list-tools #{"agent:query:run"})))
    (is (not (some #(= "execute_query" (:name %)) (registry/list-tools #{"agent:content:read"})))))
  (testing "GHY-4142: the tool advertises itself read-only"
    (let [tool (first (filter #(= "execute_query" (:name %)) (registry/list-tools nil)))]
      (is (true? (get-in tool [:annotations :readOnlyHint]))))))

;;; --------------------------------------------- Numeric-id dialect -----------------------------------------------

(defn- numeric-orders-query
  "A fresh MBQL 5 query over ORDERS in the numeric-id dialect, optionally with extra stage
   clauses merged in."
  ([] (numeric-orders-query nil))
  ([stage-extra]
   {:lib/type "mbql/query"
    :stages   [(merge {:lib/type     "mbql.stage/mbql"
                       :source-table (mt/id :orders)}
                      stage-extra)]}))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-ids-happy-path-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query (numeric-orders-query
                                       {:filters [["<=" {} ["field" {} (mt/id :orders :id)] 3]]})})
            body   (payload result)]
        (testing "a numeric-id query body executes and mints a query_handle"
          (is (= 3 (:returned body)))
          (is (string? (:query_handle body)))
          (is (= [1 2 3] (sort (row-ids body)))))
        (testing "the minted handle re-runs the same query"
          (is (= [1 2 3] (sort (row-ids (payload (call! sid {:query_handle (:query_handle body)})))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-ids-implicit-join-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query (numeric-orders-query
                                       {:aggregation [["count" {}]]
                                        :breakout    [["field" {} (mt/id :products :category)]]})})
            body   (payload result)]
        (testing "a numeric field ref on an FK-related table gets its implicit join wired by repair"
          (is (= 4 (:returned body)))
          (is (some #(= "CATEGORY" (:name %)) (:cols body))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-ids-validate-only-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            result (call! sid {:query         (numeric-orders-query {:limit 2})
                               :validate_only true})
            body   (payload result)]
        (testing "validate_only accepts the numeric dialect and mints a handle without executing"
          (is (= 0 (:returned body)))
          (is (string? (:query_handle body))))
        (testing "the handle then executes the validated query"
          (is (= 2 (:returned (payload (call! sid {:query_handle (:query_handle body)}))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-source-card-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-temp [:model/Card card {:dataset_query (lib/limit (orders-card-query) 5)}]
        (let [sid    (str (random-uuid))
              result (call! sid {:query {:lib/type "mbql/query"
                                         :stages   [{:lib/type    "mbql.stage/mbql"
                                                     :source-card (:id card)
                                                     :limit       2}]}})
              body   (payload result)]
          (testing "a numeric source-card id resolves to the saved card"
            (is (= 2 (:returned body)))))))))

(deftest ^:parallel numeric-unknown-table-teaching-error-test
  ;; Error paths mint nothing — call through registry/call-tool directly, like the other
  ;; ^:parallel error-path tests above.
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query {:lib/type "mbql/query"
                                                       :stages   [{:lib/type     "mbql.stage/mbql"
                                                                   :source-table 999999999}]}}))]
      (testing "an unknown numeric table id is a teaching error steering to browse_data"
        (is (str/includes? msg "No table found with id 999999999"))
        (is (str/includes? msg "browse_data"))))))

(deftest ^:parallel error-hints-name-v2-tools-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          mp  (lib-be/application-database-metadata-provider (mt/id))
          db  (:name (lib.metadata/database mp))]
      (testing "a name-resolution miss steers to browse_data, never to the v1 read_resource surface"
        (let [msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                                  {:query {:lib/type "mbql/query"
                                                           :stages   [{:lib/type     "mbql.stage/mbql"
                                                                       :source-table [db "PUBLIC" "NO_SUCH_TABLE"]}]}}))]
          (is (str/includes? msg "No table found matching portable FK"))
          (is (str/includes? msg "browse_data"))
          (is (not (str/includes? msg "read_resource")))
          (is (not (str/includes? msg "metabase://"))))))))

;;; -------------------------------- Numeric metric / measure / segment refs ---------------------------------------

;; The numeric-id dialect documents `["measure", {}, 7]`, `["segment", {}, 3]` and
;; `["metric", {}, 42]`, but nothing in the PR exercises them. These pin the happy path and
;; the unknown-id recovery message, which is the one an agent that guessed an id actually reads.

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-measure-ref-executes-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-temp [:model/Measure {measure-id :id}
                     {:name       "query-test order count"
                      :table_id   (mt/id :orders)
                      :creator_id (mt/user->id :crowberto)
                      :definition {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages   [{:lib/type     :mbql.stage/mbql
                                               :source-table (mt/id :orders)
                                               :aggregation  [[:count {:lib/uuid (str (random-uuid))}]]}]}}]
        (let [sid  (str (random-uuid))
              body (payload (call! sid {:query (numeric-orders-query
                                                {:aggregation [["measure" {} measure-id]]})}))]
          (testing "a numeric measure ref executes"
            (is (= 1 (:returned body)))
            (is (pos-int? (ffirst (:rows body))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-segment-ref-executes-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-temp [:model/Segment {segment-id :id}
                     {:name       "query-test first three orders"
                      :table_id   (mt/id :orders)
                      :creator_id (mt/user->id :crowberto)
                      :definition {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages   [{:lib/type     :mbql.stage/mbql
                                               :source-table (mt/id :orders)
                                               :filters      [[:<= {:lib/uuid (str (random-uuid))}
                                                               [:field {:lib/uuid (str (random-uuid))}
                                                                (mt/id :orders :id)]
                                                               3]]}]}}]
        (let [sid  (str (random-uuid))
              body (payload (call! sid {:query (numeric-orders-query
                                                {:filters [["segment" {} segment-id]]})}))]
          (testing "a numeric segment ref executes and filters"
            (is (= 3 (:returned body)))
            (is (= [1 2 3] (sort (row-ids body))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest numeric-metric-ref-executes-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-temp [:model/Card {metric-id :id}
                     {:type          :metric
                      :name          "query-test order count metric"
                      :dataset_query (lib/aggregate (orders-card-query) (lib/count))}]
        (let [sid  (str (random-uuid))
              body (payload (call! sid {:query (numeric-orders-query
                                                {:aggregation [["metric" {} metric-id]]})}))]
          (testing "a numeric metric (card) ref executes"
            (is (= 1 (:returned body)))
            (is (pos-int? (ffirst (:rows body))))))))))

;; An id the agent guessed is echoed back to it, so it has to survive the round trip verbatim.
;; `tru` formats a bare number through MessageFormat, which applies locale digit grouping and
;; turns 999999999 into "999,999,999" — an id the agent cannot retry with. The v2 unknown-table
;; error already guards this by passing `(str table-id)`; these three paths do not.
(deftest ^:parallel numeric-unknown-measure-teaching-error-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query
                                                       {:aggregation [["measure" {} 999999999]]})}))]
      (testing "the unknown id is echoed verbatim, not locale-grouped"
        (is (str/includes? msg "999999999"))
        (is (not (str/includes? msg "999,999,999"))))
      (testing "and the message steers to the v2 discovery tool"
        (is (str/includes? msg "browse_data"))
        (is (not (str/includes? msg "read_resource")))))))

(deftest ^:parallel numeric-unknown-segment-teaching-error-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query
                                                       {:filters [["segment" {} 999999999]]})}))]
      (testing "the unknown id is echoed verbatim, not locale-grouped"
        (is (str/includes? msg "999999999"))
        (is (not (str/includes? msg "999,999,999"))))
      (testing "and the message steers to the v2 discovery tool"
        (is (str/includes? msg "browse_data"))
        (is (not (str/includes? msg "read_resource")))))))

(deftest ^:parallel numeric-unknown-metric-teaching-error-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query
                                                       {:aggregation [["metric" {} 999999999]]})}))]
      (testing "the unknown id is echoed verbatim, not locale-grouped"
        (is (str/includes? msg "999999999"))
        (is (not (str/includes? msg "999,999,999"))))
      (testing "and the message steers the agent at a v2 tool, never v1's read_resource"
        (is (or (str/includes? msg "search") (str/includes? msg "browse_data")))
        (is (not (str/includes? msg "read_resource")))))))

;; Field refs are the highest-traffic numeric ref in the new dialect, so the unknown-field-id
;; message is the one an agent hits most often after guessing.
(deftest ^:parallel numeric-unknown-field-teaching-error-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query
                                                       {:filters [[">" {} ["field" {} 999999999] 0]]})}))]
      (testing "the unknown field id is echoed verbatim, not locale-grouped"
        (is (str/includes? msg "999999999"))
        (is (not (str/includes? msg "999,999,999"))))
      (testing "and the message steers to the v2 discovery tool"
        (is (str/includes? msg "browse_data"))
        (is (not (str/includes? msg "read_resource")))))))

;; The pipeline states the miss; this surface supplies the recovery sentence. These assert the
;; two halves actually meet — a v2 caller gets v2 vocabulary and never v1's.
(deftest ^:parallel recovery-hints-reach-the-agent-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query
                                                       {:filters [[">" {} ["field" {} 999999999] 0]]})}))]
      (testing "the base statement and this surface's hint arrive as one message"
        (is (str/includes? msg "No field found with id 999999999."))
        (is (str/includes? msg "browse_data")))
      (testing "and never v1's vocabulary"
        (is (not (str/includes? msg "read_resource")))
        (is (not (str/includes? msg "metabase://")))))))

(deftest ^:parallel uri-in-source-table-hint-is-v2-flavored-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query {:lib/type "mbql/query"
                                                       :stages   [{:lib/type     "mbql.stage/mbql"
                                                                   :source-table "metabase://metric/76"}]}}))]
      (testing "the URI rejection carries v2's numeric-id recovery, not v1's portable_entity_id one"
        (is (str/includes? msg "does not accept URIs"))
        (is (str/includes? msg "aggregation"))
        (is (not (str/includes? msg "portable_entity_id")))))))

;;; --------------------------------------- Schema failures and dialect round-trips --------------------------------

;;; GHY-4313. `:query` stays an open `[:map]` at the registry boundary on purpose: the dialect
;;; `execute_query` accepts is the union of the numeric-id and portable-name forms *plus* the
;;; repair layer's forgiveness, which no single lib schema describes. What these pin down instead
;;; is the two properties a strict schema was meant to buy — a structural failure teaches rather
;;; than stonewalls, and the shapes the tool documents keep working.

(deftest ^:parallel schema-invalid-query-names-the-offending-path-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          msg (error-text (registry/call-tool execute-scope sid "execute_query"
                                              {:query (numeric-orders-query {:limit "ten"})}))]
      (testing "a structurally invalid query is refused with the path and the expectation, not a bare verdict"
        (is (str/includes? msg "limit"))
        (is (str/includes? msg "should be an integer"))
        (is (str/includes? msg "stages")))
      (testing "and never as an opaque internal failure"
        (is (not (str/includes? msg "Internal error")))))))

(deftest ^:parallel schema-failure-locates-the-offending-stage-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid   (str (random-uuid))
          query {:lib/type "mbql/query"
                 :stages   [{:lib/type "mbql.stage/mbql" :source-table (mt/id :orders)}
                            {:lib/type "mbql.stage/mbql" :fields "not-a-list"}]}
          msg   (error-text (registry/call-tool execute-scope sid "execute_query" {:query query}))]
      (testing "the failing stage is named by index — a model editing a multi-stage query needs to know which one"
        (is (str/includes? msg "1"))
        (is (str/includes? msg "fields"))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest repair-forgiven-shortcuts-still-execute-test
  (testing "GHY-4313: the shortcuts the repair layer exists to forgive are not schema failures"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [sid (str (random-uuid))]
          (testing "a stage that omits lib/type still runs"
            (is (= 1 (:returned (payload (call! sid {:query {:lib/type "mbql/query"
                                                             :stages   [{:source-table (mt/id :orders)
                                                                         :limit        1}]}}))))))
          (testing "a clause written without its options map still runs"
            (is (= 1 (:returned (payload (call! sid {:query (numeric-orders-query
                                                             {:aggregation [["count"]]})})))))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest documented-dialect-example-executes-test
  (testing "GHY-4313: the worked example in the execute_query tool description runs as written"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [body (payload (call! (str (random-uuid))
                                   {:query {:lib/type "mbql/query"
                                            :stages   [{:lib/type     "mbql.stage/mbql"
                                                        :source-table (mt/id :orders)
                                                        :aggregation  [["count" {}]]
                                                        :breakout     [["field"
                                                                        {:temporal-unit "month"}
                                                                        (mt/id :orders :created_at)]]}]}
                                    :row_limit 5}))]
          (is (pos? (:returned body))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest definition-round-trip-executes-test
  (testing "GHY-4313: get_content's `definition` output is accepted back as `query` verbatim, as the tool docs promise"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-temp [:model/Card card {:dataset_query (lib/limit (orders-card-query) 5)}]
        (mt/with-current-user (mt/user->id :rasta)
          (let [sid        (str (random-uuid))
                content    (registry/call-tool #{"agent:content:read"} sid "get_content"
                                               {:items   [{:type "question" :id (:id card)}]
                                                :include ["definition"]})
                definition (-> content response-text json/decode+kw
                               :results first :definition)]
            (is (some? definition) "get_content returned no definition to round-trip")
            (is (pos? (:returned (payload (call! sid {:query definition :row_limit 5})))))))))))

;;; ------------------------------------------- QP input whitelist -------------------------------------------------

;;; GHY-4313: the tool's `:query` is an open map, so these drive the tool with extra keys in it and
;;; assert on what reaches the query processor — the QP itself is stubbed, so nothing but the
;;; boundary's own filtering can account for a key's absence.

(def ^:private fake-qp-result
  "The minimum a stubbed `process-query` has to return for the tool to finish a page."
  {:status :completed
   :data   {:cols [{:name "ID" :base_type :type/BigInteger :display_name "ID"}]
            :rows [[1]]}})

(defn- capture-qp-query!
  "Call `execute_query` with `arguments`, stubbing the QP so nothing executes, and return the
   query map that reached [[metabase.query-processor.core/process-query]]. Throws if the tool
   returned an error, so a rejected call can never look like a stripped key."
  [arguments]
  (let [captured (atom nil)]
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (mt/with-dynamic-fn-redefs [qp/process-query (fn [query]
                                                       (reset! captured query)
                                                       fake-qp-result)]
          (let [result (call! (str (random-uuid)) arguments)]
            (when (:isError result)
              (throw (ex-info "expected success, got tool error" {:result result})))))))
    (or @captured
        (throw (ex-info "process-query was never called" {:arguments arguments})))))

(defn- pk-ordered-orders-query
  "An ORDERS query already ordered by its PK, merged with `extra`. Its row order is total, so
   [[metabase.mcp.v2.query/with-total-order]] passes it through as-is — what is stored is what
   reaches the QP."
  [extra]
  (merge (numeric-orders-query {:limit    1
                                :order-by [["asc" {} ["field" {} (mt/id :orders :id)]]]})
         {:database (mt/id)}
         extra))

(defn- stored-handle!
  "Mint a query handle over `stored` for rasta. The handle path skips the representations
   pipeline, so the stored query reaches the execution boundary with the keys it was minted with."
  [session-id stored]
  (mt/with-current-user (mt/user->id :rasta)
    (v2.queries/mint-query-handle! session-id (mt/user->id :rasta)
                                   (v2.queries/encode-serialized-query stored))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest query-info-never-reaches-the-qp-test
  (testing "GHY-4313: a query's own :info never reaches the QP — MCP alone attributes the execution"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid            (str (random-uuid))
            handle         (stored-handle! sid (pk-ordered-orders-query {:info {:card-id 999}}))
            {:keys [info]} (capture-qp-query! {:query_handle handle})]
        (is (not (contains? info :card-id)))
        (is (= (mt/user->id :rasta) (:executed-by info)))
        (is (= :agent (:context info)))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest caller-middleware-never-reaches-the-qp-test
  (testing "GHY-4313: the caller cannot set query :middleware — MCP alone chooses the QP options"
    (let [{:keys [middleware]} (capture-qp-query!
                                {:query (assoc (numeric-orders-query {:limit 1})
                                               :middleware {:ignore-cached-results? true})})]
      (is (not (contains? middleware :ignore-cached-results?)))
      (is (true? (:js-int-to-string? middleware))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest unknown-caller-key-never-reaches-the-qp-test
  (testing "GHY-4313: a top-level key MCP does not pass through is dropped before the QP sees the query"
    (let [captured (capture-qp-query! {:query (assoc (numeric-orders-query {:limit 1}) :evil "x")})]
      (is (not (contains? captured :evil))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest query-shape-still-reaches-the-qp-test
  (testing "GHY-4313: the query itself survives the whitelist — the QP runs what the caller asked for"
    (let [captured (capture-qp-query! {:query (numeric-orders-query {:limit 1})})]
      (is (= :mbql/query (:lib/type captured)))
      (is (= (mt/id) (:database captured)))
      (is (= 1 (count (:stages captured))))
      (is (= (mt/id :orders) (get-in captured [:stages 0 :source-table])))
      (is (= 1 (get-in captured [:stages 0 :limit]))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest stored-parameters-still-reach-the-qp-test
  (testing "GHY-4313: a stored query's :parameters survive the whitelist — bound values ride the handle"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            params [{:type "number/=" :target ["variable" ["template-tag" "n"]] :value 1}]
            handle (stored-handle! sid (pk-ordered-orders-query {:parameters params}))]
        (is (= params (:parameters (capture-qp-query! {:query_handle handle}))))))))
