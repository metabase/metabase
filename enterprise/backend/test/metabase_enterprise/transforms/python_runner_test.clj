(ns ^:mb/driver-tests metabase-enterprise.transforms.python-runner-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.python-runner :as python-runner]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn template->regex
  "Convert a template string with $var$ placeholders to a regex pattern.
   Example: template->regex 'File ___PATH___/script.py, line ___LINE___'
   will match 'File /tmp/unique-path/script.py, line 123'"
  [template]
  (-> template
      (str/replace "\\" "\\\\")
      (str/replace "." "\\.")
      (str/replace "*" "\\*")
      (str/replace "+" "\\+")
      (str/replace "?" "\\?")
      (str/replace "^" "\\^")
      (str/replace "$" "\\$")
      (str/replace "{" "\\{")
      (str/replace "}" "\\}")
      (str/replace "(" "\\(")
      (str/replace ")" "\\)")
      (str/replace "|" "\\|")
      (str/replace "[" "\\[")
      (str/replace "]" "\\]")
      (str/replace #"___PATH___" "(/[\\\\w-]+)+")
      (str/replace #"___LINE___" "\\\\d+")
      re-pattern))

(defn- execute [{:keys [code tables]}]
  (:body (python-runner/execute-python-code code (or tables {}))))

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")
          result         (execute {:code transform-code})]
      (is (=? {:output "name,age\nAlice,25\nBob,30\n"
               :stdout "Successfully saved 2 rows to CSV\n"
               :stderr ""}
              result)))))

(deftest ^:parallel transform-function-missing-test
  (testing "handles missing transform function"
    (let [result (execute {:code (str "import pandas as pd\n"
                                      "\n"
                                      "# No transform function defined")})]
      (is (=? {:error     "Execution failed"
               :exit-code 1
               :stderr    "ERROR: User script must define a 'transform()' function\n"
               :stdout    ""}
              result)))))

(deftest ^:parallel transform-function-wrong-return-type-test
  (testing "handles transform function returning non-DataFrame"
    (let [result (execute {:code (str "def transform():\n"
                                      "    return 'not a dataframe'")})]
      (is (=? {:error     "Execution failed"
               :exit-code 1
               :stderr    "ERROR: Transform function must return a pandas DataFrame, got <class 'str'>\n"
               :stdout    ""}
              result)))))

(deftest ^:parallel transform-function-error-test
  (testing "handles transform function with error"
    (let [result            (execute {:code (str "def transform():\n"
                                                 "    raise ValueError('Something went wrong')")})
          expected-template (str "ERROR: Transform function failed: Something went wrong\n"
                                 "Traceback (most recent call last):\n"
                                 "  File \"/app/transform_runner.py\", line ___LINE___, in main\n"
                                 "    result = script.transform()\n"
                                 "             ^^^^^^^^^^^^^^^^^^\n"
                                 "  File \"___PATH___/script.py\", line 2, in transform\n"
                                 "    raise ValueError('Something went wrong')\n"
                                 "ValueError: Something went wrong\n")
          stderr-pattern    (template->regex expected-template)]

      (is (=? {:error     "Execution failed"
               :exit-code 1
               :stderr    #(re-matches stderr-pattern %)
               :stdout    ""
               :timeout   false}
              result)))))

(deftest ^:parallel transform-function-complex-dataframe-test
  (testing "can create complex DataFrames with transform"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    data = {'x': [1, 2, 3], 'y': [10, 20, 30], 'z': ['a', 'b', 'c']}\n"
                              "    return pd.DataFrame(data)")
          result         (execute {:code transform-code})]
      (is (=? {:output "x,y,z\n1,10,a\n2,20,b\n3,30,c\n"
               :stdout "Successfully saved 3 rows to CSV\n"
               :stderr ""}
              result)))))

(deftest ^:parallel transform-function-with-db-parameter-test
  (mt/test-driver [:postgres]
    (testing "transform function can accept db parameter for forward compatibility"
      (let [transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform(df):\n"
                                "    # Test that db object is passed but we don't use it in this test\n"
                                "    data = {'name': ['Charlie', 'Dana'], 'score': [85, 92]}\n"
                                "    return pd.DataFrame(data)")
            result         (execute {:code transform-code})]
        (is (=? {:output "name,score\nCharlie,85\nDana,92\n"
                 :stdout "Successfully saved 2 rows to CSV\n"
                 :stderr ""}
                result))))))

(deftest transform-function-with-working-database-test
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    (mt/test-drivers [:postgres]
      (mt/with-empty-db
        (let [db-spec        (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              _              (jdbc/execute! db-spec ["DROP TABLE IF EXISTS students"])
              _              (jdbc/execute! db-spec ["CREATE TABLE students (id INTEGER PRIMARY KEY, name VARCHAR(100), score INTEGER)"])
              _              (jdbc/execute! db-spec ["INSERT INTO students (id, name, score) VALUES (1, 'Alice', 85), (2, 'Bob', 92), (3, 'Charlie', 88), (4, 'Dana', 90)"])

              _              (sync/sync-database! (mt/db))

              transform-code (str "import pandas as pd\n"
                                  "\n"
                                  "def transform(students):\n"
                                  "    # Calculate average score\n"
                                  "    avg_score = students['score'].mean()\n"
                                  "    result = pd.DataFrame({\n"
                                  "        'student_count': [len(students)],\n"
                                  "        'average_score': [round(avg_score, 2)]\n"
                                  "    })\n"
                                  "    return result")
              result         (execute {:code   transform-code
                                       :tables {"students" (mt/id :students)}})]

          (is (=? {:output "student_count,average_score\n4,88.75\n"
                   :stdout "Successfully saved 1 rows to CSV\n"
                   :stderr ""}
                  result)))))))
