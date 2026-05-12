(ns metabase.agent-lib.validate.cross-checks-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.validate.cross-checks :as cross-checks]))

(deftest validate-no-metric-order-by-test
  (testing "rejects metric helper inside order-by"
    (let [error (try
                  (cross-checks/validate-no-metric-order-by!
                   [:operations 0]
                   ["order-by" ["metric" 42]])
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error))))
      (is (re-find #"metric helpers cannot be used directly inside order-by"
                   (:details (ex-data error))))))
  (testing "accepts field inside order-by"
    (is (nil? (cross-checks/validate-no-metric-order-by!
               [:operations 0]
               ["order-by" ["field" 1]]))))
  (testing "ignores non-order-by operations"
    (is (nil? (cross-checks/validate-no-metric-order-by!
               [:operations 0]
               ["filter" ["metric" 42]])))))

(deftest validate-no-source-metric-reuse-test
  (testing "rejects reuse of source metric id"
    (let [context {:source-entity {:model "metric" :id 42}
                   :referenced-entities []
                   :surrounding-tables []}
          error   (try
                    (cross-checks/validate-no-source-metric-reuse!
                     context
                     [:operations 0]
                     ["aggregate" ["metric" 42]])
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
      (is error)
      (is (= :invalid-generated-program (:error (ex-data error))))
      (is (re-find #"source is already metric 42"
                   (:details (ex-data error))))))
  (testing "accepts different metric id"
    (let [context {:source-entity {:model "metric" :id 42}
                   :referenced-entities []
                   :surrounding-tables []}]
      (is (nil? (cross-checks/validate-no-source-metric-reuse!
                 context
                 [:operations 0]
                 ["aggregate" ["metric" 99]])))))
  (testing "no-op for table sources"
    (let [context {:source-entity {:model "table" :id 1}
                   :referenced-entities []
                   :surrounding-tables []}]
      (is (nil? (cross-checks/validate-no-source-metric-reuse!
                 context
                 [:operations 0]
                 ["aggregate" ["metric" 42]]))))))
