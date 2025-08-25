(ns metabase.python-runner.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code "import pandas as pd\n\ndef transform():\n    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})"
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "name,age\nAlice,25\nBob,30\n"
              :stdout "Successfully saved 2 rows to CSV\n"
              :stderr ""}
             result)))))

(deftest ^:parallel transform-function-missing-test
  (testing "handles missing transform function"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code "import pandas as pd\n\n# No transform function defined"})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    "ERROR: User script must define a 'transform()' function\n"
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-wrong-return-type-test
  (testing "handles transform function returning non-DataFrame"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code "def transform():\n    return 'not a dataframe'"})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    "ERROR: Transform function must return a pandas DataFrame, got <class 'str'>\n"
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-error-test
  (testing "handles transform function with error"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code "def transform():\n    raise ValueError('Something went wrong')"})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    (str "ERROR: Transform function failed: Something went wrong\nTraceback (most recent call last):\n"
                              "  File \"/sandbox/transform_runner.py\", line 41, in main\n"
                              "    result = script.transform()\n"
                              "             ^^^^^^^^^^^^^^^^^^\n"
                              "  File \"/sandbox/script.py\", line 2, in transform\n"
                              "    raise ValueError('Something went wrong')\n"
                              "ValueError: Something went wrong\n")
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-complex-dataframe-test
  (testing "can create complex DataFrames with transform"
    (let [transform-code "import pandas as pd\n\ndef transform():\n    data = {'x': [1, 2, 3], 'y': [10, 20, 30], 'z': ['a', 'b', 'c']}\n    return pd.DataFrame(data)"
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "x,y,z\n1,10,a\n2,20,b\n3,30,c\n"
              :stdout "Successfully saved 3 rows to CSV\n"
              :stderr ""}
             result)))))
