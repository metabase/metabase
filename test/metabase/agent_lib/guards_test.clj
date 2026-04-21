(ns metabase.agent-lib.guards-test
  "Tests for security and robustness guards added to agent-lib."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.common.errors :as errors]
   [metabase.agent-lib.repair.context.passes :as passes]
   [metabase.agent-lib.repair.stages :as repair.stages]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.validate :as validate]
   [metabase.agent-lib.validate.context :as validate.context]
   [metabase.agent-lib.validate.walker :as walker]
   [metabase.lib.test-metadata :as meta]))

(set! *warn-on-reflection* true)

(defn- orders-context
  "Minimal context with only the orders table allowed."
  []
  {:source-entity       {:model "table" :id (meta/id :orders)
                         :columns (mapv (fn [f] {:id (meta/id :orders f)})
                                        (meta/fields :orders))}
   :referenced-entities []
   :surrounding-tables  []
   :measure-ids         []})

(defn- ex-details
  "Extract the :details string from an ExceptionInfo thrown by invalid-program!."
  [^Exception e]
  (:details (ex-data e)))

;; --- P0: Table source validation ---

(deftest validate-source-rejects-table-not-in-context-test
  (let [allowed-ids (validate.context/context-allowed-ids (orders-context))]
    (testing "table in context passes"
      (is (= {}
             (validate.context/validate-source!
              (fn [& _] {})
              allowed-ids
              [:source]
              {:type "table" :id (meta/id :orders)}
              0
              {}))))
    (testing "table NOT in context is rejected"
      (try
        (validate.context/validate-source!
         (fn [& _] {})
         allowed-ids
         [:source]
         {:type "table" :id 99999}
         0
         {})
        (is false "expected unknown table to be rejected")
        (catch clojure.lang.ExceptionInfo e
          (is (= :invalid-generated-program (:error (ex-data e))))
          (is (re-find #"not available in the provided context" (ex-details e))))))))

(deftest ^:parallel validated-program-rejects-unknown-table-source-test
  (let [program {:source     {:type "table" :id 99999}
                 :operations []}
        context (orders-context)]
    (try
      (validate/validated-program program context)
      (is false "expected unknown table to be rejected")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (re-find #"not available in the provided context" (ex-details e)))))))

;; --- P1: Runtime nil-guard ---

(deftest ^:parallel helper-fn-rejects-nil-binding-test
  (let [rt {:bindings {'known identity 'nil-bound nil}}]
    (testing "non-nil binding returns the function"
      (is (fn? (runtime/helper-fn rt 'known))))
    (testing "nil binding throws"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No runtime binding for operator"
           (runtime/helper-fn rt 'nil-bound))))
    (testing "missing binding throws"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No runtime binding for operator"
           (runtime/helper-fn rt 'totally-missing))))))

;; --- P1: Program nesting depth ---

(deftest ^:parallel validated-program-rejects-deeply-nested-program-sources-test
  (let [leaf {:source {:type "table" :id (meta/id :orders)} :operations []}
        deep-program (reduce (fn [inner _]
                               {:source     {:type "program" :program inner}
                                :operations []})
                             leaf
                             (range (+ walker/max-program-nesting 2)))
        context (orders-context)]
    (try
      (validate/validated-program deep-program context)
      (is false "expected deep nesting to be rejected")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (re-find #"program source nesting exceeds maximum depth" (ex-details e)))))))

;; --- P2: Depth-limited contains-aggregation-ref? ---

(deftest ^:parallel contains-aggregation-ref-respects-depth-limit-test
  (testing "shallow aggregation-ref is found"
    (is (true? (repair.stages/contains-aggregation-ref?
                ["aggregate" ["sum" ["aggregation-ref" 0]]]))))
  (testing "deeply nested structure does not overflow"
    (let [deep (reduce (fn [inner _] [inner]) ["aggregation-ref" 0] (range 100))]
      ;; Returns false (too deep) rather than overflowing the stack
      (is (false? (repair.stages/contains-aggregation-ref? deep))))))

;; --- P2: Depth-limited tree walk in passes ---

(deftest ^:parallel operation-contains-canonical-op-respects-depth-limit-test
  (testing "shallow match is found"
    (is (true? (passes/operation-contains-canonical-op?
                ["aggregate" ["sum" ["metric" 1]]]
                "metric"))))
  (testing "deeply nested structure does not overflow"
    (let [deep (reduce (fn [inner _] [inner]) ["metric" 1] (range 100))]
      ;; Returns false (too deep) rather than overflowing the stack
      (is (false? (passes/operation-contains-canonical-op? deep "metric"))))))

;; --- P2: String length validation ---

(deftest ^:parallel walk-node-rejects-overlong-strings-test
  (let [long-string (apply str (repeat (inc walker/max-string-length) "x"))]
    (try
      (walker/walk-node [:test] long-string 0 {} (fn [_ _ _ state] state))
      (is false "expected overlong string to be rejected")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (re-find #"string value exceeds maximum length" (ex-details e))))))
  (testing "strings within limit pass"
    (is (= {:node-count 1}
           (walker/walk-node [:test] "short" 0 {} (fn [_ _ _ state] state))))))

;; --- P2: Error messages don't leak schema ---

(deftest ^:parallel lookup-table-error-keeps-schema-out-of-message-test
  (let [rt (runtime/build-runtime meta/metadata-provider)]
    (try
      ((runtime/helper-fn rt 'table) "nonexistent_table")
      (is false "expected table lookup to fail")
      (catch clojure.lang.ExceptionInfo e
        (testing "message does not enumerate available tables"
          (is (not (re-find #"orders" (ex-message e)))))
        (testing "recovery map carries available names for LLM agents"
          (is (seq (get-in (ex-data e) [:recovery :available]))))))))

;; --- Empty operations list ---

(deftest ^:parallel validate-empty-operations-test
  (let [program {:source {:type "table" :id (meta/id :orders)} :operations []}
        context (orders-context)]
    (is (= program (validate/validated-program program context)))))

;; --- Structured error helpers ---

(deftest ^:parallel wrap-runtime-error-preserves-recovery-from-cause-test
  (let [cause   (ex-info "Table not found: foo"
                         {:table-name "foo"
                          :recovery   {:available ["orders" "products"]}})
        wrapped (errors/wrap-runtime-error [:source] "table" cause)]
    (testing "standard fields are set"
      (is (= :invalid-generated-program (:error (ex-data wrapped))))
      (is (= "table" (:operator (ex-data wrapped)))))
    (testing "recovery from cause is preserved"
      (is (= {:available ["orders" "products"]}
             (:recovery (ex-data wrapped)))))
    (testing "cause chain is preserved"
      (is (= cause (.getCause ^Exception wrapped))))))

(deftest ^:parallel wrap-runtime-error-promotes-legacy-available-key-test
  (let [cause   (ex-info "Field not found" {:field-name "foo" :available ["a" "b"]})
        wrapped (errors/wrap-runtime-error [:ops 0] "field" cause)]
    (testing "top-level :available is promoted into :recovery"
      (is (= ["a" "b"] (get-in (ex-data wrapped) [:recovery :available]))))))

(deftest ^:parallel recovery-summary-formats-hints-test
  (testing "available values"
    (is (= "Available: orders, products"
           (errors/recovery-summary {:available ["orders" "products"]}))))
  (testing "tables for disambiguation"
    (is (= "Matching tables: orders, people"
           (errors/recovery-summary {:tables ["orders" "people"]}))))
  (testing "suggestion"
    (is (= "Use (field \"TABLE\" \"FIELD\") to disambiguate."
           (errors/recovery-summary {:suggestion "Use (field \"TABLE\" \"FIELD\") to disambiguate."}))))
  (testing "combined"
    (let [summary (errors/recovery-summary {:available  ["a" "b"]
                                            :suggestion "Try again."})]
      (is (re-find #"Available: a, b" summary))
      (is (re-find #"Try again\." summary))))
  (testing "empty recovery returns nil"
    (is (nil? (errors/recovery-summary {})))
    (is (nil? (errors/recovery-summary nil)))))
