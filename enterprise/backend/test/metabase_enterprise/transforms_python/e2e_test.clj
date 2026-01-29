(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.e2e-test
  "End-to-end tests for Python library functionality."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.util :as mt.util]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest transforms-python-with-library-test
  (testing "Python transform execution with common library"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (mt.util/with-discard-model-updates! [:model/PythonLibrary]
            ;; Create or update the python library
            (python-library/update-python-library-source! "common"
                                                          (str "def multiply_by_two(x):\n"
                                                               "    return x * 2\n"
                                                               "\n"
                                                               "def add_greeting(name):\n"
                                                               "    return f'Hello, {name}!'\n"))
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
              ;; Create and run a transform that uses the library
              (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                       :schema schema
                                                                       :name   "library_test_output"}]
                (let [transform-body (str "import pandas as pd\n"
                                          "from common import multiply_by_two, add_greeting\n"
                                          "\n"
                                          "def transform():\n"
                                          "    data = {\n"
                                          "        'number': [1, 2, 3, 4, 5],\n"
                                          "        'doubled': [multiply_by_two(x) for x in [1, 2, 3, 4, 5]],\n"
                                          "        'name': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],\n"
                                          "        'greeting': [add_greeting(name) for name in ['Alice', 'Bob', 'Charlie', 'David', 'Eve']]\n"
                                          "    }\n"
                                          "    return pd.DataFrame(data)")
                      transform-payload {:name   "Library Test Transform"
                                         :source {:type  "python"
                                                  :source-database (mt/id)
                                                  :source-tables {}
                                                  :body transform-body}
                                         :target (assoc target :database (mt/id))}
                      {transform-id :id} (mt/user-http-request :crowberto :post 200 "transform"
                                                               transform-payload)]
                  (transforms.tu/test-run transform-id)
                  (transforms.tu/wait-for-table table-name 5000)
                  (is (true? (driver/table-exists? driver/*driver* (mt/db) target)))

                  (let [rows (transforms.tu/table-rows table-name)]
                    (is (= 5 (count rows)))
                    (is (every? #(= (* 2 (first %)) (second %)) rows))
                    (is (= ["Hello, Alice!" "Hello, Bob!" "Hello, Charlie!" "Hello, David!" "Hello, Eve!"]
                           (map #(nth % 3) rows)))))))))))))

(deftest execute-transforms-python-test
  (testing "transform execution with :transforms/table target"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "target_table"}]
              (let [original           {:name   "Gadget Products"
                                        :source {:type  "python"
                                                 :source-database (mt/id)
                                                 :source-tables {"transforms_customers" (mt/id :transforms_customers)}
                                                 :body  (str "import pandas as pd\n"
                                                             "\n"
                                                             "def transform():\n"
                                                             "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                        :target  (assoc target :database (mt/id))}
                    {transform-id :id} (mt/user-http-request :crowberto :post 200 "transform"
                                                             original)]
                (transforms.tu/test-run transform-id)
                (transforms.tu/wait-for-table table-name 5000)
                (is (true? (driver/table-exists? driver/*driver* (mt/db) target)))
                (is (= [["Alice" 25] ["Bob" 30]]
                       (transforms.tu/table-rows table-name)))))))))))
