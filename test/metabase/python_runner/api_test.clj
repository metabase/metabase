(ns ^:mb/driver-tests metabase.python-runner.api-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

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
                                               {:code                 transform-code
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

(deftest transform-function-with-working-database-test
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    (mt/test-drivers [:postgres]
      (mt/with-empty-db
        (let [db-details           (:details (mt/db))
              db-spec              (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              _                    (jdbc/execute! db-spec ["DROP TABLE IF EXISTS students"])
              _                    (jdbc/execute! db-spec ["CREATE TABLE students (id INTEGER PRIMARY KEY, name VARCHAR(100), score INTEGER)"])
              _                    (jdbc/execute! db-spec ["INSERT INTO students (id, name, score) VALUES (1, 'Alice', 85), (2, 'Bob', 92), (3, 'Charlie', 88), (4, 'Dana', 90)"])

              pg-connection-string (format "postgresql://%s:%s@%s:%s/%s"
                                           (or (:user db-details) "christruter")
                                           (or (:password db-details) "")
                                          ;; quirk
                                           (str/replace (or (:host db-details) "127.0.0.1") #"localhost" "127.0.0.1")
                                           (or (:port db-details) 5432)
                                           (:db db-details))

              transform-code       (str "import pandas as pd\n"
                                        "\n"
                                        "def transform(db):\n"
                                        "    # Read the students table\n"
                                        "    students = db.read_table('students')\n"
                                        "    # Calculate average score\n"
                                        "    avg_score = students['score'].mean()\n"
                                        "    result = pd.DataFrame({\n"
                                        "        'student_count': [len(students)],\n"
                                        "        'average_score': [round(avg_score, 2)]\n"
                                        "    })\n"
                                        "    return result")
              result               (mt/user-http-request :crowberto :post 200 "python-runner/execute"
                                                         {:code                 transform-code
                                                          :db-connection-string pg-connection-string})]

          (is (= {:output "student_count,average_score\n4,88.75\n"
                  :stdout "Successfully saved 1 rows to CSV\n"
                  :stderr ""}
                 result)))))))

