(ns metabase.python-runner.api-test
  (:require
   [clojure.java.io]
   [clojure.java.shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "name,age\nAlice,25\nBob,30\n"
              :stdout "Successfully saved 2 rows to CSV\n"
              :stderr ""}
             result)))))

(deftest ^:parallel transform-function-missing-test
  (testing "handles missing transform function"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code (str "import pandas as pd\n"
                                                   "\n"
                                                   "# No transform function defined")})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    "ERROR: User script must define a 'transform()' function\n"
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-wrong-return-type-test
  (testing "handles transform function returning non-DataFrame"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code (str "def transform():\n"
                                                   "    return 'not a dataframe'")})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    "ERROR: Transform function must return a pandas DataFrame, got <class 'str'>\n"
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-error-test
  (testing "handles transform function with error"
    (let [result (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                       {:code (str "def transform():\n"
                                                   "    raise ValueError('Something went wrong')")})]
      (is (= {:error     "Execution failed: "
              :exit-code 1
              :stderr    (str "ERROR: Transform function failed: Something went wrong\n"
                              "Traceback (most recent call last):\n"
                              "  File \"/sandbox/transform_runner.py\", line 107, in main\n"
                              "    result = script.transform()\n"
                              "             ^^^^^^^^^^^^^^^^^^\n"
                              "  File \"/sandbox/script.py\", line 2, in transform\n"
                              "    raise ValueError('Something went wrong')\n"
                              "ValueError: Something went wrong\n")
              :stdout    ""}
             result)))))

(deftest ^:parallel transform-function-complex-dataframe-test
  (testing "can create complex DataFrames with transform"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    data = {'x': [1, 2, 3], 'y': [10, 20, 30], 'z': ['a', 'b', 'c']}\n"
                              "    return pd.DataFrame(data)")
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "x,y,z\n1,10,a\n2,20,b\n3,30,c\n"
              :stdout "Successfully saved 3 rows to CSV\n"
              :stderr ""}
             result)))))

(deftest ^:parallel transform-function-with-db-parameter-test
  (testing "transform function can accept db parameter for forward compatibility"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform(db):\n"
                              "    # Test that db object is passed but we don't use it in this test\n"
                              "    data = {'name': ['Charlie', 'Dana'], 'score': [85, 92]}\n"
                              "    return pd.DataFrame(data)")
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "name,score\nCharlie,85\nDana,92\n"
              :stdout "Successfully saved 2 rows to CSV\n"
              :stderr ""}
             result)))))

(deftest ^:parallel transform-function-db-error-handling-test
  (testing "transform function fails clearly on database connection errors"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform(db):\n"
                              "    # Try to read a table with invalid connection - should fail clearly\n"
                              "    result = db.read_table('nonexistent_table')\n"
                              "    return result")
          result         (mt/user-http-request :crowberto :post 500 "python-runner/execute"
                                               {:code transform-code
                                                :db-connection-string "invalid://connection/string"})]
      (is (contains? result :exit-code))
      (is (= 1 (:exit-code result)))
      (is (str/includes? (:stderr result) "ERROR: Transform function failed:")))))

(deftest ^:parallel transform-function-db-object-structure-test
  (testing "db object provides expected interface structure"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform(db):\n"
                              "    # Test that db object has expected attributes and methods\n"
                              "    if not hasattr(db, 'read_table'):\n"
                              "        raise ValueError('db object missing read_table method')\n"
                              "    \n"
                              "    # Test that we can call the method (will fail without real connection)\n"
                              "    # but shows the expected interface\n"
                              "    data = {'test_result': ['db_object_has_read_table_method']}\n"
                              "    return pd.DataFrame(data)")
          result         (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                               {:code transform-code})]
      (is (= {:output "test_result\ndb_object_has_read_table_method\n"
              :stdout "Successfully saved 1 rows to CSV\n"
              :stderr ""}
             result)))))

(deftest ^:parallel transform-function-with-working-database-test
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    ;; TODO use whichever driver is currently under test
    (when (try
            (Class/forName "org.postgresql.Driver")
            true
            (catch ClassNotFoundException _ false))

      ;; TODO use a table loaded by the test, get the connection string from :model/Database
      (let [pg-connection-string "postgresql://christruter:@127.0.0.1:5432/testdb"
            transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform(db):\n"
                                "    # Try to read a students table\n"
                                "    students = db.read_table('students')\n"
                                "    # Calculate average score\n"
                                "    avg_score = students['score'].mean()\n"
                                "    result = pd.DataFrame({\n"
                                "        'student_count': [len(students)],\n"
                                "        'average_score': [round(avg_score, 2)]\n"
                                "    })\n"
                                "    return result")
            result (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                         {:code transform-code
                                          :db-connection-string pg-connection-string})]

        (is (= {:output "student_count,average_score\n4,87.75\n",
                :stderr "Successfully connected to database: postgresql://christruter:@host.docker.internal:543...\n",
                :stdout "Successfully saved 1 rows to CSV\n"}
               result))))))

