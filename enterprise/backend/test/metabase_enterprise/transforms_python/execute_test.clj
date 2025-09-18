(ns ^:mb/driver-tests metabase-enterprise.transforms-python.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.test :as mt]
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
                  (transforms-python.execute/execute-python-transform! transform {:run-method :manual})
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
                                               (transforms-python.execute/execute-python-transform!
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
                  (transforms-python.execute/execute-python-transform! transform {:run-method :manual})
                  (transforms.tu/wait-for-table table-name 10000)

                  (transforms-python.execute/execute-python-transform! transform {:run-method :manual})

                  (let [db-id (mt/id)
                        tables (t2/select :model/Table :db_id db-id :active true)
                        new-table-pattern (re-pattern (str ".*" table-name "_" transforms-python.execute/temp-table-suffix-new "_.*"))
                        old-table-pattern (re-pattern (str ".*" table-name "_" transforms-python.execute/temp-table-suffix-old "_.*"))]
                    (is (not-any? #(or (re-matches new-table-pattern (:name %))
                                       (re-matches old-table-pattern (:name %))) tables)
                        (str "No temp tables (_" transforms-python.execute/temp-table-suffix-new "_ or _" transforms-python.execute/temp-table-suffix-old "_) should remain after successful Python transform"))

                    (is (= [[1 "a"] [2 "b"] [3 "c"]] (transforms.tu/table-rows table-name))
                        "Table should contain the expected data after swap")))))))))))
