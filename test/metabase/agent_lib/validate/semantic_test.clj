(ns metabase.agent-lib.validate.semantic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.test-util :as tu]
   [metabase.agent-lib.validate.semantic :as semantic]))

(deftest ^:parallel validate-program-passes-valid-program-test
  (testing "valid program passes through unchanged"
    (let [program {:source     {:type "context" :ref "source"}
                   :operations [["filter" ["=" ["field" 1] "hello"]]
                                ["limit" 10]]}
          context (tu/table-context :orders)]
      (is (= program (semantic/validate-program program context))))))

(deftest validate-program-rejects-unknown-table-source-test
  (testing "unknown table source raises invalid-generated-program"
    (let [program {:source     {:type "table" :id 999999}
                   :operations [["limit" 10]]}
          context (tu/table-context :orders)
          error   (try
                    (semantic/validate-program program context)
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error)))))))

(deftest validate-program-rejects-metric-in-order-by-test
  (testing "metric helper inside order-by is rejected"
    (let [program {:source     {:type "context" :ref "source"}
                   :operations [["order-by" ["metric" 42]]]}
          context (tu/table-context :orders)
          error   (try
                    (semantic/validate-program program context)
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error))))
      (is (re-find #"metric helpers cannot be used directly inside order-by"
                   (:details (ex-data error)))))))
