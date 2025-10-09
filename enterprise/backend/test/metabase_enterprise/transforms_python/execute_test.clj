(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.test :as mt]
   [metabase.test.util :as test.util]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(deftest atomic-python-transform-swap-test
  (testing "Python transform execution with atomic table swap"
    (mt/test-drivers #{:mysql :postgres}
      (mt/with-premium-features #{:transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "swap_tbl"}]
              (let [initial-transform {:name   "Python Transform Initial"
                                       :source {:type  "python"
                                                :source-tables {}
                                                :body  (str "import pandas as pd\n"
                                                            "\n"
                                                            "def transform():\n"
                                                            "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                       :target (assoc target :database (mt/id))}]
                (mt/with-temp [:model/Transform transform initial-transform]
                  (transforms-python.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table table-name 10000)

                  (let [initial-rows (transforms.tu/table-rows table-name)]
                    (is (= [["Alice" 25] ["Bob" 30]] initial-rows) "Initial data should be Alice and Bob")

                    (t2/update! :model/Transform (:id transform)
                                {:source {:type "python"
                                          :source-tables {}
                                          :body (str "import pandas as pd\n"
                                                     "\n"
                                                     "def transform():\n"
                                                     "    return pd.DataFrame({'name': ['Charlie', 'Diana', 'Eve'], 'age': [35, 40, 45]})")}}))

                  (let [swap-latch (CountDownLatch. 1)
                        original-rename-tables-atomic! transforms.util/rename-tables!]
                    (with-redefs [transforms.util/rename-tables! (fn [driver db-id rename-pairs]
                                                                   (.await swap-latch)
                                                                   (original-rename-tables-atomic! driver db-id rename-pairs))]
                      (let [transform-future (future
                                               (transforms-python.execute/execute!
                                                (t2/select-one :model/Transform (:id transform))
                                                {:run-method :manual}))]
                        (is (= [["Alice" 25] ["Bob" 30]]
                               (transforms.tu/table-rows table-name))
                            "Original data should still be accessible during transform")
                        (.countDown swap-latch)
                        @transform-future
                        (is (= [["Charlie" 35] ["Diana" 40] ["Eve" 45]]
                               (transforms.tu/table-rows table-name))
                            "Table should now contain Charlie, Diana, and Eve")))))))))))))

(deftest python-transform-temp-table-cleanup-test
  (testing "Python transform cleans up temp tables on success"
    (mt/test-drivers #{:mysql :postgres}
      (mt/with-premium-features #{:transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "cleanup_"}]
              (let [transform-def {:name   "Python Transform Cleanup"
                                   :source {:type  "python"
                                            :source-tables {}
                                            :body  (str "import pandas as pd\n"
                                                        "\n"
                                                        "def transform():\n"
                                                        "    return pd.DataFrame({'col1': [1, 2, 3], 'col2': ['a', 'b', 'c']})")}
                                   :target (assoc target :database (mt/id))}]
                (mt/with-temp [:model/Transform transform transform-def]
                  (transforms-python.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table table-name 10000)

                  (transforms-python.execute/execute! transform {:run-method :manual})

                  (let [db-id (mt/id)
                        tables (t2/select :model/Table :db_id db-id :active true)]
                    (is (not-any? transforms.util/is-temp-transform-table? tables)
                        "No temp tables should remain after successful Python transform")

                    (is (= [[1 "a"] [2 "b"] [3 "c"]] (transforms.tu/table-rows table-name))
                        "Table should contain the expected data after swap")))))))))))

(deftest python-transform-timeout-status-test
  (testing "Python transform execution sets correct timeout status when script times out"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [target {:type   "table"
                                              :schema schema
                                              :name   "timeout_test"}]
              (test.util/with-temporary-setting-values [python-runner-timeout-seconds 5]
                (let [long-running-code (str "import time\n"
                                             "import pandas as pd\n"
                                             "\n"
                                             "def transform():\n"
                                             "    time.sleep(10)  # Sleep longer than timeout\n"
                                             "    return pd.DataFrame({'result': ['should_not_reach_here']})")
                      transform-def {:name   "Python Transform Timeout Test"
                                     :source {:type          "python"
                                              :source-tables {}
                                              :body          long-running-code}
                                     :target (assoc target :database (mt/id))}]
                  (mt/with-temp [:model/Transform transform transform-def]
                    (let [{:keys [run_id]} (try
                                             (transforms-python.execute/execute-python-transform! transform {:run-method :manual})
                                             (catch Exception _
                                               ;; We expect this to fail due to timeout
                                               {:run_id (t2/select-one-fn :id :model/TransformRun
                                                                          :transform_id (:id transform)
                                                                          {:order-by [[:start_time :desc]]})}))
                          run-status (t2/select-one-fn :status :model/TransformRun :id run_id)]
                      (testing "Transform run should have timeout status"
                        (is (= :timeout run-status)
                            "Transform run status should be :timeout when Python script times out")))))))))))))
