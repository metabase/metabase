(ns metabase.agent-lib.eval.invoke-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.eval.invoke :as eval.invoke]
   [metabase.agent-lib.test-util :as agent-lib.tu]))

(defn- runtime-with-bindings
  [bindings]
  {:bindings bindings})

(deftest invoke-helper-rejects-unknown-operators-test
  (let [runtime (runtime-with-bindings {'known identity})]
    (try
      (eval.invoke/invoke-helper! runtime [:operations 0] 'missing [])
      (is false "expected unknown helper to fail")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (= "missing" (:operator (ex-data e))))))))

(deftest invoke-query-aware-helper-requires-current-query-test
  (let [runtime (runtime-with-bindings {'filter (fn [& _] :ok)})]
    (try
      (eval.invoke/invoke-query-aware-helper! runtime nil [:operations 0] 'filter [])
      (is false "expected query-aware helper to require current query")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (re-find #"`filter` requires the current query state"
                     (:details (ex-data e))))))))

(deftest invoke-query-aware-helper-shapes-expression-ref-errors-test
  (let [runtime (runtime-with-bindings {'expression-ref (fn [& _]
                                                          (throw (ex-info "missing expression" {})))})]
    (try
      (eval.invoke/invoke-query-aware-helper! runtime {:query true} [:operations 0] 'expression-ref ["Net"])
      (is false "expected expression-ref failure")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (= "expression-ref" (:operator (ex-data e))))
        (is (= "Net" (:name (ex-data e))))))))

(deftest invoke-field-helper-prefers-query-aware-arity-test
  (let [runtime (runtime-with-bindings {'field (fn [query arg] [query arg])})]
    (is (= [:current-query 42]
           (eval.invoke/invoke-field-helper! runtime :current-query [:operations 0] [42])))))

(deftest ensure-query-result-recognizes-pmbql-queries-test
  (testing "non-query values are rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"must return a pMBQL query map"
         (eval.invoke/ensure-query-result! :not-a-query))))
  (testing "queries pass through unchanged"
    (let [query (agent-lib.tu/query-for-table :orders)]
      (is (= query (eval.invoke/ensure-query-result! query))))))
