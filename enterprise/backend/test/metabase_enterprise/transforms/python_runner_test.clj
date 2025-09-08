(ns ^:mb/driver-tests metabase-enterprise.transforms.python-runner-test
  (:require
   [clojure.core.async :as a]
   [clojure.data.csv :as csv]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.transforms.python-runner :as python-runner]
   [metabase-enterprise.transforms.schedule :as transforms.schedule]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sync.core :as sync]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(def ^:private test-id 1)

(defn- reconstruct-logs [{:keys [events] :as body}]
  (assoc body :stdout (->> events (filter #(= "stdout" (:stream %))) (map :message) (str/join "\n"))
         :stderr (->> events (filter #(= "stderr" (:stream %))) (map :message) (str/join "\n"))))

(defn- execute [{:keys [code tables]}]
  (reconstruct-logs (:body (python-runner/execute-python-code test-id code (or tables {}) (a/promise-chan)))))

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")
          result         (execute {:code transform-code})]
      (is (=? {:output "name,age\nAlice,25\nBob,30\n"
               :stdout "Successfully saved 2 rows to CSV\nSuccessfully saved output manifest with 2 fields"
               :stderr ""}
              result)))))

(deftest ^:parallel transform-function-missing-test
  (testing "handles missing transform function"
    (let [result (execute {:code (str "import pandas as pd\n"
                                      "\n"
                                      "# No transform function defined")})]
      (is (=? {:error     "Execution failed"
               :exit-code 1
               :stderr    "ERROR: User script must define a 'transform()' function"
               :stdout    ""}
              result)))))

(deftest ^:parallel transform-function-wrong-return-type-test
  (testing "handles transform function returning non-DataFrame"
    (let [result (execute {:code (str "def transform():\n"
                                      "    return 'not a dataframe'")})]
      (is (=? {:error     "Execution failed"
               :exit-code 1
               :stderr    "ERROR: Transform function must return a pandas DataFrame, got <class 'str'>"
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
                                 "ValueError: Something went wrong")
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
               :stdout "Successfully saved 3 rows to CSV\nSuccessfully saved output manifest with 3 fields"
               :stderr ""}
              result)))))

(deftest ^:parallel transform-function-with-db-parameter-test
  (mt/test-drivers #{:postgres}
    (testing "transform function can accept db parameter for forward compatibility"
      (let [transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform():\n"
                                "    data = {'name': ['Charlie', 'Dana'], 'score': [85, 92]}\n"
                                "    return pd.DataFrame(data)")
            result         (execute {:code transform-code})]
        (is (=? {:output "name,score\nCharlie,85\nDana,92\n"
                 :stdout "Successfully saved 2 rows to CSV\nSuccessfully saved output manifest with 2 fields"
                 :stderr ""}
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
              result         (execute {:code   transform-code
                                       :tables {"students" (mt/id :students)}})]

          (is (=? {:output   "id,name,score\n1,Alice,85\n2,Bob,92\n3,Charlie,88\n4,Dana,90\n"
                   :metadata #(= (json/decode+kw %)
                                 {:version         "0.1.0"
                                  :fields          [{:base_type      "Integer",
                                                     :dtype          "int64",
                                                     :database_type  "int4",
                                                     :effective_type "int4",
                                                     :name           "id",
                                                     :semantic_type  nil,
                                                     :root_type      "Integer"}
                                                    {:base_type      "Text",
                                                     :dtype          "object",
                                                     :database_type  "varchar",
                                                     :effective_type "varchar",
                                                     :name           "name",
                                                     :semantic_type  nil,
                                                     :root_type      "Text"}
                                                    {:base_type      "Integer",
                                                     :dtype          "int64",
                                                     :database_type  "int4",
                                                     :effective_type "int4",
                                                     :name           "score",
                                                     :semantic_type  nil,
                                                     :root_type      "Integer"}],
                                  :source_metadata {:fields         [{:base_type      "Integer",
                                                                      :dtype          "int64",
                                                                      :database_type  "int4",
                                                                      :effective_type "int4",
                                                                      :name           "id",
                                                                      :semantic_type  nil,
                                                                      :root_type      "Integer"}
                                                                     {:base_type      "Text",
                                                                      :dtype          "object",
                                                                      :database_type  "varchar",
                                                                      :effective_type "varchar",
                                                                      :name           "name",
                                                                      :semantic_type  nil,
                                                                      :root_type      "Text"}
                                                                     {:base_type      "Integer",
                                                                      :dtype          "int64",
                                                                      :database_type  "int4",
                                                                      :effective_type "int4",
                                                                      :name           "score",
                                                                      :semantic_type  nil,
                                                                      :root_type      "Integer"}],
                                                    :table_metadata {:table_id (mt/id :students)},
                                                    :version        "0.1.0"}})
                   :stdout   (str "Successfully saved 4 rows to CSV\n"
                                  "Successfully saved output manifest with 3 fields")
                   :stderr   ""}
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
              result         (execute {:code   transform-code
                                       :tables {"students" (mt/id :students)}})]

          (is (=? {:output   "student_count,average_score\n4,88.75\n"
                   :metadata #(= (json/decode+kw %)
                                 {:version        "0.1.0",
                                  :fields         [{:name "student_count", :dtype "int64"}
                                                   {:name "average_score", :dtype "float64"}]})
                   :stdout   (str "Successfully saved 1 rows to CSV\n"
                                  "Successfully saved output manifest with 2 fields")
                   :stderr   ""}
                  result)))))))

(defn- datetime-equal?
  [expected-iso-str actual-pandas-str]
  (let [formatter   (t/formatter "yyyy-MM-dd HH:mm:ssXXX")
        expected-dt (t/zoned-date-time expected-iso-str)
        actual-dt   (t/offset-date-time formatter actual-pandas-str)]
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
            result (execute {:code transform-code
                             :tables {"sample_table" (mt/id :sample_table)}})
            csv-data (csv/read-csv (:output result))
            headers (first csv-data)
            rows (rest csv-data)
            [row1 row2 row3] rows
            header-to-index (zipmap headers (range))
            get-col (fn [row col-name] (nth row (header-to-index col-name)))
            metadata (some-> (:metadata result) json/decode+kw)]

        (is (= (set ["id" "name" "description" "count" "price" "is_active" "created_date" "updated_at" "scheduled_for"])
               (set headers)))

        (is (= "1" (get-col row1 "id")))
        (is (= "Product A" (get-col row1 "name")))
        (is (datetime-equal? "2024-01-16T14:00:00Z" (get-col row1 "scheduled_for")))

        (is (= "2" (get-col row2 "id")))
        (is (= "Product B" (get-col row2 "name")))
        (is (datetime-equal? "2024-02-02T21:30:00Z" (get-col row2 "scheduled_for")))

        (is (= "3" (get-col row3 "id")))
        (is (= "Product C" (get-col row3 "name")))
        (is (datetime-equal? "2024-03-11T06:00:00Z" (get-col row3 "scheduled_for")))
        (testing "dtypes are preserved correctly"
          (is (= {"id"            :type/Integer
                  "name"          :type/Text
                  "description"   :type/Text
                  "count"         :type/Integer
                  "price"         :type/Float
                  "is_active"     :type/Boolean
                  ;; Our hack works
                  "created_date"  :type/Date
                  "updated_at"    :type/DateTime
                  "scheduled_for" :type/DateTimeWithTZ}
                 (u/for-map [{:keys [name dtype]} (:fields metadata)]
                   [name (transforms.util/dtype->base-type dtype)]))))))))

(deftest python-transform-scheduled-job-test
  (mt/test-helpers-set-global-values!
    (mt/with-temp-scheduler!
      (task/init! ::transforms.schedule/RunTransform)
      (mt/test-drivers #{:h2 :postgres}
        (mt/with-premium-features #{:transforms}
          (mt/dataset transforms-dataset/transforms-test
            (transforms.tu/with-transform-cleanup! [target {:type   "table"
                                                            :schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                                                            :name   "target_table"}]
              (mt/with-temp
                [:model/TransformTag {tag-id :id}       {:name "every second"}
                 :model/Transform    {transform-id :id} {:name   "Gadget Products"
                                                         :source {:type  "python"
                                                                  :source-database (mt/id)
                                                                  :source-tables {"transforms_customers" (mt/id :transforms_customers)}
                                                                  :body  (str "import pandas as pd\n"
                                                                              "\n"
                                                                              "def transform():\n"
                                                                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                                         :target  (assoc target :database (mt/id))}
                 :model/TransformTransformTag   _  {:transform_id transform-id :tag_id tag-id :position 0}
                 :model/TransformJob {job-id :id :as job} {:schedule "* * * * * ? *"}
                 :model/TransformJobTransformTag _ {:job_id job-id :tag_id tag-id :position 0}]
                (transforms.schedule/initialize-job! job)
                (transforms.schedule/update-job! job-id "* * * * * ? *")
                (is (true? (u/poll {:thunk   (fn [] (driver/table-exists? driver/*driver* (mt/db) target))
                                    :done?   true?
                                    :timeout 30000})))
                (is (true? (t2/exists? :model/Table :name (:name target))))))))))))

(deftest transform-type-roundtrip-test
  (mt/test-drivers #{:postgres :h2 :mysql :bigquery-cloud-sdk :redshift :snowflake :sqlserver}
    (mt/with-empty-db
      (let [driver       driver/*driver*
            db-id        (mt/id)
            table-name   (mt/random-name)
            schema-name  (sql.tx/session-schema driver)
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
            _ (driver/insert-from-source! driver db-id qualified-table-name
                                          (mapv :name (:columns table-schema))
                                          {:type :rows :data row-values})

            _ (sync/sync-database! (mt/db))
            transform-code (str "import pandas as pd\n"
                                "\n"
                                "def transform(" table-name "):\n"
                                "    return " table-name)
            result (execute {:code transform-code
                             :tables {table-name (mt/id qualified-table-name)}})
            metadata (some-> (:metadata result) json/decode+kw)]

        (testing "All expected columns are present"
          (is (= #{"id" "price" "active" "created_tz" "created_at" "created_date" "description"}
                 (set (map :name (:fields metadata))))))

        (testing "dtypes are preserved correctly"
          (is (= {"id"           :type/Integer
                  "price"        :type/Float
                  "active"       :type/Boolean
                  "created_tz"   :type/DateTimeWithTZ
                  "created_at"   :type/DateTime
                  "created_date" :type/Date
                  "description"  :type/Text}
                 (u/for-map [{:keys [name dtype]} (:fields metadata)]
                   [name (transforms.util/dtype->base-type dtype)]))))

        ;; cleanup
        (driver/drop-table! driver db-id (:name table-schema))))))
