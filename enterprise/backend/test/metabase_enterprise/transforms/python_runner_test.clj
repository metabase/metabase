(ns ^:mb/driver-tests metabase-enterprise.transforms.python-runner-test
  (:require
   [clojure.core.async :as a]
   [clojure.data.csv :as csv]
   [clojure.data.json :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as jt]
   [metabase-enterprise.transforms.execute :as execute]
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

(def ^:private test-id 1)

(defn- execute [{:keys [code tables]}]
  (:body (python-runner/execute-python-code test-id code (or tables {}) (a/promise-chan))))

(deftest ^:parallel transform-function-basic-test
  (testing "executes transform function and returns CSV output"
    (let [transform-code (str "import pandas as pd\n"
                              "\n"
                              "def transform():\n"
                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")
          result         (execute {:code transform-code})]
      (is (=? {:output "name,age\nAlice,25\nBob,30\n"
               :stdout "Successfully saved 2 rows to CSV\nSuccessfully saved output manifest with 2 fields\n"
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
               :stdout "Successfully saved 3 rows to CSV\nSuccessfully saved output manifest with 3 fields\n"
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
                 :stdout "Successfully saved 2 rows to CSV\nSuccessfully saved output manifest with 2 fields\n"
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
                   :metadata "{\n  \"version\": \"0.1.0\",\n  \"fields\": [\n    {\n      \"name\": \"student_count\",\n      \"dtype\": \"int64\"\n    },\n    {\n      \"name\": \"average_score\",\n      \"dtype\": \"float64\"\n    }\n  ],\n  \"table_metadata\": {}\n}"
                   :stdout (str "Successfully saved 1 rows to CSV\n"
                                "Successfully saved output manifest with 2 fields\n")
                   :stderr ""}
                  result)))))))

(defn- datetime-equal?
  [expected-iso-str actual-pandas-str]
  (let [formatter (jt/formatter "yyyy-MM-dd HH:mm:ssXXX")
        expected-dt (jt/zoned-date-time expected-iso-str)
        actual-dt (jt/offset-date-time formatter actual-pandas-str)]
    (= (jt/to-millis-from-epoch expected-dt)
       (jt/to-millis-from-epoch actual-dt))))

(deftest transform-type-test
  (mt/test-drivers [:postgres]
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
                                "    df['scheduled_for'] = pd.to_datetime(df['scheduled_for'])\n"
                                "    return df")
            result (execute {:code transform-code
                             :tables {"sample_table" (mt/id :sample_table)}})
            csv-data (csv/read-csv (:output result))
            headers (first csv-data)
            rows (rest csv-data)
            [row1 row2 row3] rows
            header-to-index (zipmap headers (range))
            get-col (fn [row col-name] (nth row (header-to-index col-name)))
            metadata (some-> (:metadata result) (json/read-str :key-fn keyword))]

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

        (testing "dtypes are preserved correctly using dtype->table-type"
          (let [field-by-name (into {} (map (juxt :name :dtype) (:fields metadata)))
                dtype->table-type #'execute/dtype->table-type]
            (is (= :int (dtype->table-type (field-by-name "id"))))
            (is (= :text (dtype->table-type (field-by-name "name"))))
            (is (= :text (dtype->table-type (field-by-name "description"))))
            (is (= :int (dtype->table-type (field-by-name "count"))))
            (is (= :float (dtype->table-type (field-by-name "price"))))
            (is (= :boolean (dtype->table-type (field-by-name "is_active"))))
            (is (= :datetime (dtype->table-type (field-by-name "scheduled_for"))))

            ;; TODO: ideally those would be preserved.. but they're "object" dtypes for now
            (is (= :text (dtype->table-type (field-by-name "created_date"))))
            (is (= :text (dtype->table-type (field-by-name "updated_at"))))))))))
