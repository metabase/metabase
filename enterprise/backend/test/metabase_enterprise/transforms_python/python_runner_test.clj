(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.python-runner-test
  (:require
   [clojure.core.async :as a]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.util :as tu]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private last-job-run-id (atom 0))

(defn next-job-run-id [] (swap! last-job-run-id inc))

(defn- parse-jsonl [s] (map json/decode+kw (str/split-lines s)))

(defn template->regex
  "Convert a template string with $var$ placeholders to a regex pattern.
   Example: template->regex 'File ___PATH___/script.py, line ___LINE___'
   will match 'File /tmp/unique-path/script.py, line 123'"
  [template]
  (-> template
      (str/replace #"(?m)^\d{13}\s*" "")
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

(defn- jsonl-output [expected] #(= expected (parse-jsonl %)))

(defn execute! [{:keys [code tables]}]
  (with-open [shared-storage-ref (s3/open-shared-storage! (or tables {}))]
    (let [server-url     (transforms-python.settings/python-runner-url)
          cancel-chan    (a/promise-chan)
          table-name->id (or tables {})
          test-id        (next-job-run-id)
          _              (python-runner/copy-tables-to-s3! {:run-id         test-id
                                                            :shared-storage @shared-storage-ref
                                                            :source         {:source-tables table-name->id}
                                                            :cancel-chan    cancel-chan})
          response       (python-runner/execute-python-code-http-call! {:server-url     server-url
                                                                        :code           code
                                                                        :run-id         test-id
                                                                        :table-name->id table-name->id
                                                                        :shared-storage @shared-storage-ref})
          events (python-runner/read-events @shared-storage-ref)
          output-manifest (python-runner/read-output-manifest @shared-storage-ref)]
      ;; not sure about munging this all together but its what tests expect for now
      (merge (:body response)
             {:output          (when-some [in (python-runner/open-output @shared-storage-ref)] (with-open [in in] (slurp in)))
              :output-manifest output-manifest
              :stdout          (->> events (filter #(= "stdout" (:stream %))) (map :message) (str/join "\n"))
              :stderr          (->> events (filter #(= "stderr" (:stream %))) (map :message) (str/join "\n"))}))))

(defn ok-stdout [num-rows num-cols]
  (format (str "Successfully saved %d rows to S3\n"
               "Successfully saved output manifest with %d fields to S3")
          num-rows num-cols))

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")
          result         (execute! {:code transform-code})]
      (is (=? {:output (jsonl-output [{:name "Alice", :age 25}
                                      {:name "Bob", :age 30}])
               :stdout (ok-stdout 2 2)}
              result)))))

(deftest ^:parallel transform-function-missing-test
  (testing "handles missing transform function"
    (let [result (execute! {:code (str "import pandas as pd\n"
                                       "\n"
                                       "# No transform function defined")})]
      (is (=? {:exit_code 1
               :stderr    "ERROR: User script must define a 'transform()' function"
               :stdout    ""}
              result)))))

(deftest ^:parallel transform-function-wrong-return-type-test
  (testing "handles transform function returning non-DataFrame"
    (let [result (execute! {:code (str "def transform():\n"
                                       "    return 'not a dataframe'")})]
      (is (=? {:exit_code 1
               :stderr    "ERROR: Transform function must return a pandas DataFrame, got <class 'str'>"
               :stdout    ""}
              result)))))

(deftest ^:parallel transform-function-error-test
  (testing "handles transform function with error"
    (let [result            (execute! {:code (str "def transform():\n"
                                                  "    raise ValueError('Something went wrong')")})
          expected-template (str "ERROR: Transform function failed: Something went wrong\n"
                                 "Traceback (most recent call last):\n"
                                 "  File \"___PATH___/transform_runner.py\", line ___LINE___, in main\n"
                                 "    result = script.transform()\n"
                                 "             ^^^^^^^^^^^^^^^^^^\n"
                                 "  File \"___PATH___/script.py\", line 2, in transform\n"
                                 "    raise ValueError('Something went wrong')\n"
                                 "ValueError: Something went wrong")
          stderr-pattern    (template->regex expected-template)]
      (is (=? {:exit_code 1
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
          result         (execute! {:code transform-code})]
      (is (=? {:output (jsonl-output [{:x 1, :y 10, :z "a"}
                                      {:x 2, :y 20, :z "b"}
                                      {:x 3, :y 30, :z "c"}])
               :stdout (ok-stdout 3 3)}
              result)))))

(deftest ^:parallel transform-function-with-db-parameter-test
  (mt/test-drivers #{:postgres}
    (testing "transform function can accept db parameter for forward compatibility"
      (let [transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform():\n"
                                "    data = {'name': ['Charlie', 'Dana'], 'score': [85, 92]}\n"
                                "    return pd.DataFrame(data)")
            result         (execute! {:code transform-code})]
        (is (=? {:output (jsonl-output [{:name "Charlie", :score 85}
                                        {:name "Dana", :score 92}])
                 :stdout (ok-stdout 2 2)}
                result))))))

(deftest transform-function-with-pass-thru
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    (mt/test-drivers #{:postgres}
      (mt/with-empty-db
        (let [db-spec        (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              _              (jdbc/execute! db-spec ["DROP TABLE IF EXISTS students"])
              _              (jdbc/execute! db-spec ["CREATE TABLE students (id INTEGER PRIMARY KEY, name VARCHAR(100), score INTEGER)"])
              _              (jdbc/execute! db-spec ["INSERT INTO students (id, name, score) VALUES (1, 'Alice', 85), (2, 'Bob', 92), (3, 'Charlie', 88), (4, 'Dana', 90)"])

              _              (sync/sync-database! (mt/db))

              transform-code (str "import pandas as pd\n"
                                  "\n"
                                  "def transform(students):\n"
                                  "    return students")
              result         (execute! {:code   transform-code
                                        :tables {"students" (mt/id :students)}})]

          (is (=? {:output          (jsonl-output [{:id 1 :name "Alice" :score 85}
                                                   {:id 2 :name "Bob" :score 92}
                                                   {:id 3 :name "Charlie" :score 88}
                                                   {:id 4 :name "Dana" :score 90}])
                   :output-manifest {:fields          [{:base_type      "Integer",
                                                        :database_type  "int4",
                                                        :effective_type "Integer",
                                                        :name           "id",
                                                        :root_type      "Number",
                                                        :semantic_type  "PK"}
                                                       {:base_type      "Text",
                                                        :database_type  "varchar",
                                                        :effective_type "Text",
                                                        :name           "name",
                                                        :root_type      "Text",
                                                        :semantic_type  "Name"}
                                                       {:base_type      "Integer",
                                                        :database_type  "int4",
                                                        :effective_type "Integer",
                                                        :name           "score",
                                                        :root_type      "Number",
                                                        :semantic_type  "Score"}],
                                     :source_metadata {:fields         [{:base_type      "Integer",
                                                                         :database_type  "int4",
                                                                         :effective_type "Integer",
                                                                         :name           "id",
                                                                         :root_type      "Number",
                                                                         :semantic_type  "PK"}
                                                                        {:base_type      "Text",
                                                                         :database_type  "varchar",
                                                                         :effective_type "Text",
                                                                         :name           "name",
                                                                         :root_type      "Text",
                                                                         :semantic_type  "Name"}
                                                                        {:base_type      "Integer",
                                                                         :database_type  "int4",
                                                                         :effective_type "Integer",
                                                                         :name           "score",
                                                                         :root_type      "Number",
                                                                         :semantic_type  "Score"}],
                                                       :table_metadata {:table_id (mt/malli=? int?)},
                                                       :schema_version 1
                                                       :data_format    "jsonl"
                                                       :data_version   1}
                                     :schema_version  1
                                     :data_format     "jsonl"
                                     :data_version    1}
                   :stdout          (ok-stdout 4 3)}
                  result)))))))

(deftest transform-function-with-empty-table-test
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    (mt/test-drivers #{:postgres}
      (mt/with-empty-db
        (let [db-spec        (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              _              (jdbc/execute! db-spec ["DROP TABLE IF EXISTS students"])
              _              (jdbc/execute! db-spec ["CREATE TABLE students (id INTEGER PRIMARY KEY, name VARCHAR(100), score INTEGER)"])

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
              result         (execute! {:code  transform-code
                                        :tables {"students" (mt/id :students)}})]

          (is (=? {:output          "{\"student_count\":0,\"average_score\":null}\n"
                   :output-manifest {:schema_version 1
                                     :data_format    "jsonl"
                                     :data_version   1
                                     :fields         [{:name "student_count", :base_type "Integer"}
                                                      {:name "average_score", :base_type "Float"}]}
                   :stdout          (ok-stdout 1 2)}
                  result)))))))

(deftest transform-function-with-working-database-test
  (testing "transform function successfully connects to PostgreSQL database and reads data"
    (mt/test-drivers #{:postgres}
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
              result         (execute! {:code  transform-code
                                        :tables {"students" (mt/id :students)}})]

          (is (=? {:output          "{\"student_count\":4,\"average_score\":88.75}\n"
                   :output-manifest {:schema_version 1
                                     :data_format    "jsonl"
                                     :data_version   1
                                     :fields         [{:name "student_count", :base_type "Integer"}
                                                      {:name "average_score", :base_type "Float"}]}
                   :stdout          (ok-stdout 1 2)}
                  result)))))))

(defn- datetime-equal?
  [expected-iso-str actual-pandas-str]
  (let [expected-dt (t/zoned-date-time expected-iso-str)
        actual-dt   (t/zoned-date-time actual-pandas-str)]
    (= (t/to-millis-from-epoch expected-dt)
       (t/to-millis-from-epoch actual-dt))))

(deftest transform-type-test
  (mt/test-drivers #{:postgres}
    (mt/with-empty-db
      (let [db-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            _ (jdbc/execute! db-spec ["DROP TABLE IF EXISTS sample_table"])
            _ (jdbc/execute! db-spec ["CREATE TABLE sample_table (
                                                        id BIGSERIAL PRIMARY KEY,
                                                        name VARCHAR(255),
                                                        description TEXT,
                                                        count BIGINT,
                                                        price FLOAT,
                                                        is_active BOOLEAN,
                                                        created_date DATE,
                                                        updated_at TIMESTAMP,
                                                        scheduled_for TIMESTAMP WITH TIME ZONE
                                                    )"])
            _ (jdbc/execute! db-spec ["INSERT INTO sample_table
                                                        (name, description, count, price, is_active, created_date, updated_at, scheduled_for)
                                                      VALUES
                                                        ('Product A', 'A sample product description', 100, 29.99, true, '2024-01-15', '2024-01-15 10:30:00', '2024-01-16 14:00:00+00'),
                                                        ('Product B', 'Another product with longer description text', 50, 15.50, false, '2024-02-01', '2024-02-01 09:15:30', '2024-02-02 16:30:00-05'),
                                                        ('Product C', NULL, 0, 0.0, true, '2024-03-10', '2024-03-10 18:45:15', '2024-03-11 08:00:00+02')"])

            _ (sync/sync-database! (mt/db))

            transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform(sample_table):\n"
                                "    df = sample_table.copy()\n"
                                "    return df")
            result (execute! {:code  transform-code
                              :tables {"sample_table" (mt/id :sample_table)}})
            rows (parse-jsonl (:output result))
            headers (map name (keys (first rows)))
            [row1 row2 row3] rows
            get-col (fn [row col-name] (get row (keyword col-name)))
            metadata (:output-manifest result)]

        (is (= (set ["id" "name" "description" "count" "price" "is_active" "created_date" "updated_at" "scheduled_for"])
               (set headers)))

        (is (= 1 (get-col row1 "id")))
        (is (= "Product A" (get-col row1 "name")))
        (is (datetime-equal? "2024-01-16T14:00:00Z" (get-col row1 "scheduled_for")))

        (is (= 2 (get-col row2 "id")))
        (is (= "Product B" (get-col row2 "name")))
        (is (datetime-equal? "2024-02-02T21:30:00Z" (get-col row2 "scheduled_for")))

        (is (= 3 (get-col row3 "id")))
        (is (= "Product C" (get-col row3 "name")))
        (is (datetime-equal? "2024-03-11T06:00:00Z" (get-col row3 "scheduled_for")))
        (testing "types are preserved correctly"
          (is (= {"id"            :type/BigInteger
                  "name"          :type/Text
                  "description"   :type/Text
                  "count"         :type/BigInteger
                  "price"         :type/Float
                  "is_active"     :type/Boolean
                 ;; Our hack works
                  "created_date"  :type/Date
                  "updated_at"    :type/DateTime
                  "scheduled_for" :type/DateTimeWithLocalTZ}
                 (u/for-map [{:keys [name base_type]} (:fields metadata)]
                   [name (python-runner/restricted-insert-type base_type)]))))))))

(deftest transform-function-with-library-test
  (testing "transform function can use libraries"
    (mt/test-drivers #{:postgres}
      (mt/with-temp [:model/PythonLibrary _ {:path   "circle"
                                             :source "import math\n\ndef calculate_circle_area(radius):\n    return math.pi * radius ** 2"}
                     :model/PythonLibrary _ {:path   "utils"
                                             :source "def format_currency(amount):\n    return f\"${amount:,.2f}\""}]
        (let [transform-code (str "import pandas as pd\n"
                                  "from circle import calculate_circle_area\n"
                                  "from utils import format_currency\n"
                                  "\n"
                                  "def transform():\n"
                                  "    data = [\n"
                                  "        {'radius': 5, 'area': calculate_circle_area(5), 'price': format_currency(78.54)},\n"
                                  "        {'radius': 10, 'area': calculate_circle_area(10), 'price': format_currency(314.16)}\n"
                                  "    ]\n"
                                  "    return pd.DataFrame(data)")
              result         (execute! {:code transform-code})]
          (is (=? {:output (jsonl-output [{:radius 5,  :area 78.5398163397, :price "$78.54"}
                                          {:radius 10, :area 314.159265359, :price "$314.16"}])
                   :stdout (ok-stdout 2 3)
                   #_#_:stderr ""}
                  result)))))))

(deftest transform-function-without-libraries-test
  (testing "transform function works when no libraries exist"
    (mt/test-drivers #{:postgres}
      (with-redefs [t2/select-fn->fn (fn [k v model]
                                       (when (and (= k :path)
                                                  (= v :source)
                                                  (= model :model/PythonLibrary))
                                         {}))]
        (let [transform-code (str "import pandas as pd\n"
                                  "\n"
                                  "def transform():\n"
                                  "    return pd.DataFrame({'status': ['ok']})")
              result         (execute! {:code transform-code})]
          (is (=? {:output (jsonl-output [{:status "ok"}])
                   :stdout (ok-stdout 1 1)}
                  result)))))))

(deftest transform-function-library-import-error-test
  (testing "transform function handles missing library gracefully"
    (mt/test-drivers #{:postgres}
      (with-redefs [t2/select-fn->fn (fn [k v model]
                                       (when (and (= k :path)
                                                  (= v :source)
                                                  (= model :model/PythonLibrary))
                                         {"utils" "def helper():\n    return 42"}))]
        (let [transform-code (str "import pandas as pd\n"
                                  "from common import some_function  # This library doesn't exist\n"
                                  "\n"
                                  "def transform():\n"
                                  "    return pd.DataFrame({'value': [some_function()]})")
              result         (execute! {:code transform-code})]
          ;; TODO this error message could still be improved a lot
          (is (=? {#_#_:error     "Execution failed"
                   :exit_code 1
                   :stderr    #(str/includes? % "No module named 'common'")}
                  result)))))))

(deftest transform-type-roundtrip-test
  (mt/test-drivers #{:postgres :h2 :mysql :bigquery-cloud-sdk :redshift :snowflake :sqlserver :clickhouse}
    (mt/with-empty-db
      (let [driver       driver/*driver*
            db-id        (mt/id)
            table-name   (if (= :redshift driver)
                           (tx/db-qualified-table-name (get-in (mt/db) [:settings :database-source-dataset-name]) (mt/random-name))
                           (mt/random-name))
            schema-name  (if  (= :clickhouse driver)
                           (-> (mt/db) :details :db)
                           (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
            table-schema {:name    qualified-table-name
                          :columns [{:name "id"            :type :type/Integer  :nullable? false}
                                    {:name "price"         :type :type/Float    :nullable? true}
                                    {:name "active"        :type :type/Boolean  :nullable? true}
                                    {:name "created_tz"    :type :type/DateTimeWithTZ :nullable? true}
                                    {:name "created_at"    :type :type/DateTime :nullable? true}
                                    {:name "created_date"  :type :type/Date     :nullable? true}
                                    {:name "description"   :type :type/Text     :nullable? true}]}
            _ (mt/as-admin
                (transforms.util/create-table-from-schema! driver db-id table-schema))

            row-values   [[1
                           19.99
                           (if (= driver/*driver* :sqlserver) 1 true)
                           (if (= driver/*driver* :mysql) "2024-01-01 12:00:00" "2024-01-01T12:00:00Z")
                           (if (= driver/*driver* :mysql) "2024-01-01 12:00:00" "2024-01-01T12:00:00")
                           "2024-01-01"
                           "Sample product"]]
            _ (driver/insert-from-source! driver db-id table-schema
                                          {:type :rows :data row-values})

            _ (sync/sync-database! (mt/db) {:scan :schema})

            transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform(" table-name "):\n"
                                "    return " table-name)
            result (execute! {:code  transform-code
                              :tables {table-name (mt/id qualified-table-name)}})

            metadata (:output-manifest result)]

        (testing "All expected columns are present"
          (is (= #{"id" "price" "active" "created_tz" "created_at" "created_date" "description"}
                 (set (map :name (:fields metadata))))))

        (testing "types are preserved correctly"
          (is (= {"id"           (if (= :snowflake driver) :type/Number :type/Integer)
                  "price"        :type/Float
                  "active"       :type/Boolean
                  "created_tz"   (case driver
                                   :snowflake :type/DateTimeWithTZ
                                   :sqlserver :type/DateTimeWithZoneOffset
                                   :type/DateTimeWithLocalTZ)
                  "created_at"   :type/DateTime
                  "created_date" :type/Date
                  "description"  :type/Text}
                 (u/for-map [{:keys [name base_type]} (:fields metadata)]
                   [name (python-runner/restricted-insert-type base_type)]))))

       ;; cleanup
        (driver/drop-table! driver db-id qualified-table-name)))))

(deftest python-runner-timeout-test
  (testing "Python script execution respects timeout setting"
    (mt/with-premium-features #{:transforms-python :transforms}
      (tu/with-temporary-setting-values [python-runner-timeout-seconds 5]
        (let [long-running-code (str "import time\n"
                                     "import pandas as pd\n"
                                     "\n"
                                     "def transform():\n"
                                     "    time.sleep(10)  # Sleep longer than timeout\n"
                                     "    return pd.DataFrame({'result': ['should_not_reach_here']})")
              result            (execute! {:code long-running-code})]
          (testing "Script should timeout after 5 seconds"
            (is (contains? result :error))
            (is (str/includes? (:error result) "timeout"))))))))
