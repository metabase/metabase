(ns ^:mb/driver-tests metabase.driver.sql.transforms-test
  "Unit tests for SQL driver transform methods and their contracts."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.test-util :as transforms.tu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest compile-transform-contract-test
  (testing "compile-transform should return [sql params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-transform driver/*driver*
                                               {:query {:query "SELECT * FROM products"}
                                                :output-table :my_table
                                                :primary-key "id"})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates appropriate create table statement"
            ;; Different drivers may use different syntax
            (is (or (re-find #"(?i)INTO\s+.*my_table.*FROM" (first result))
                    (re-find #"(?i)CREATE\s+TABLE.*AS" (first result))
                    (re-find #"(?i)CREATE\s+.*TABLE.*my_table" (first result)))))))
      (testing "schema-qualified table name"
        (let [result (driver/compile-transform driver/*driver*
                                               {:query {:query "SELECT * FROM products"}
                                                :output-table :my_schema/my_table
                                                :primary-key "id"})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              ;; Both parts should appear in the SQL
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present")
              ;; Should generate valid create statement
              (is (or (re-find #"(?i)INTO\s+.*my_table.*FROM" sql)
                      (re-find #"(?i)CREATE\s+TABLE.*AS" sql)
                      (re-find #"(?i)CREATE\s+.*TABLE" sql))))))))))

(deftest compile-drop-table-contract-test
  (testing "compile-drop-table should return [sql params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-drop-table driver/*driver* :my_table)]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates DROP TABLE IF EXISTS statement"
            (is (re-find #"(?i)DROP\s+TABLE\s+IF\s+EXISTS" (first result))))
          (testing "includes table name"
            (is (re-find #"my_table" (first result))))))
      (testing "schema-qualified table name"
        (let [result (driver/compile-drop-table driver/*driver* :my_schema/my_table)]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates DROP TABLE IF EXISTS statement"
            (is (re-find #"(?i)DROP\s+TABLE\s+IF\s+EXISTS" (first result))))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present"))))))))

(deftest execute-transform-assembles-queries-test
  (testing "execute-transform! should pass correct format to execute-raw-queries!"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [compile-result (driver/compile-transform driver/*driver*
                                                     {:query {:query "SELECT * FROM products"}
                                                      :output-table :my_table
                                                      :primary-key "id"})
            drop-result (driver/compile-drop-table driver/*driver* :my_table)]
        (testing "compile methods return consistent vector format"
          (is (vector? compile-result))
          (is (vector? drop-result))
          (is (>= (count compile-result) 1))
          (is (>= (count drop-result) 1)))
        (testing "results can be assembled into a queries list"
          (let [queries [drop-result compile-result]]
            (is (every? vector? queries))
            (is (every? #(>= (count %) 1) queries))
            (is (every? #(string? (first %)) queries))))))))

(deftest format-honeysql-returns-vector-test
  (testing "format-honeysql returns [sql & params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [result (sql.qp/format-honeysql driver/*driver* {:select [:*]
                                                            :from [[:products]]})]
        (testing "returns a vector"
          (is (vector? result)))
        (testing "first element is SQL string"
          (is (string? (first result))))
        (testing "contains SELECT statement"
          (is (re-find #"(?i)SELECT" (first result))))))))

(deftest table-identifier-formatting-test
  (testing "Table identifiers are properly formatted"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (sql.qp/format-honeysql driver/*driver* (keyword "my_table"))]
          (is (vector? result))
          (is (string? (first result)))
          (is (re-find #"my_table" (first result)))))
      (testing "schema-qualified table name"
        (let [result (sql.qp/format-honeysql driver/*driver* (keyword "schema/my_table"))]
          (is (vector? result))
          (is (string? (first result)))
          ;; Drivers might quote these differently, but both parts should be present
          (is (or (re-find #"schema.*my_table" (first result))
                  (re-find #"my_table" (first result)))))))))

(deftest compile-insert-test
  (testing "compile-insert generates INSERT INTO statements"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-insert driver/*driver*
                                            {:query {:query "SELECT * FROM products"}
                                             :output-table :my_table})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "generates INSERT INTO statement"
            (is (re-find #"(?i)INSERT\s+INTO.*my_table" (first result))))
          (testing "includes SELECT statement"
            (is (re-find #"(?i)SELECT" (first result))))))
      (testing "schema-qualified table"
        (let [result (driver/compile-insert driver/*driver*
                                            {:query {:query "SELECT * FROM products"}
                                             :output-table :my_schema/my_table})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "generates INSERT INTO statement"
            (is (re-find #"(?i)INSERT\s+INTO" (first result))))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present"))))))))

(deftest run-transform!-returns-flat-rows-affected-map-test
  ;; Regression guard: `execute-raw-queries! :sql-jdbc` yields one `{:rows-affected N}` map per
  ;; statement, and the transform layer used to re-wrap that into `{:rows-affected {:rows-affected N}}`.
  ;; The nested map silently broke the incremental-rows metric (the consumer extracted a map where an
  ;; int was expected). `(int? …)` and `(= 3 …)` are both false if the double-wrap is reintroduced.
  ;; H2-only: the inline `VALUES` source keeps the transform self-contained (no source table needed).
  (testing "run-transform! returns a single {:rows-affected <int>} map, never a nested/double-wrapped one"
    (mt/test-drivers #{:h2}
      (let [base {:conn-spec     (driver/connection-spec :h2 (mt/db))
                  :database      (mt/db)
                  :output-schema "PUBLIC"
                  :query         {:query "SELECT * FROM (VALUES (1),(2),(3)) AS t(a)"}}]
        (transforms.tu/with-transform-cleanup! [full-target {:type :table :schema "PUBLIC" :name "rows_affected_full"}
                                                inc-target  {:type :table :schema "PUBLIC" :name "rows_affected_inc"}]
          (testing "[:sql :table] full create (CTAS) path"
            (let [result (driver/run-transform! :h2 (assoc base
                                                           :transform-type :table
                                                           :output-table   (keyword "PUBLIC" (:name full-target)))
                                                {})]
              (is (int? (:rows-affected result))
                  "rows-affected must be a bare int, not a nested map")))
          (testing "[:sql :table-incremental]: first run creates (CTAS), second appends via INSERT...SELECT"
            (let [details       (assoc base
                                       :transform-type :table-incremental
                                       :output-table   (keyword "PUBLIC" (:name inc-target)))
                  create-result (driver/run-transform! :h2 details {})
                  append-result (driver/run-transform! :h2 details {})]
              (is (int? (:rows-affected create-result))
                  "rows-affected must be a bare int, not a nested map")
              (is (= 3 (:rows-affected append-result))
                  "the INSERT...SELECT path reports the flat, true insert count"))))))))

(deftest ^:parallel run-transform-result-schema-test
  ;; Pins the contract that every `run-transform!` implementation's return schema
  ;; (`::driver/run-transform-result`) enforces: a map carrying an integer `:rows-affected`. The
  ;; SQL `[:sql :table]` / `[:sql :table-incremental]` methods declare this via `mu/defmethod`, and
  ;; the Python path (`run-python-transform-impl!`) reuses the same open schema. No DB needed.
  (testing "valid: a bare integer :rows-affected"
    (is (true? (mr/validate ::driver/run-transform-result {:rows-affected 0})))
    (is (true? (mr/validate ::driver/run-transform-result {:rows-affected 42}))))
  (testing "valid: open map tolerates extra keys (e.g. the Python path's :status/:body)"
    (is (true? (mr/validate ::driver/run-transform-result {:rows-affected 3, :status 200, :body {}}))))
  (testing "invalid: missing, nil, or non-integer :rows-affected"
    (is (false? (mr/validate ::driver/run-transform-result {})))
    (is (false? (mr/validate ::driver/run-transform-result {:rows-affected nil})))
    (is (false? (mr/validate ::driver/run-transform-result {:rows-affected "5"})))
    (is (false? (mr/validate ::driver/run-transform-result {:rows-affected 1.5})))))

(defn- venues-source-query
  "Lib query projecting [name, price] from venues — the source shape both characterization tests
  use. Non-identity columns only, so SQL Server's `SELECT INTO` doesn't carry an `IDENTITY`
  property into the target."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/with-fields [(lib.metadata/field mp (mt/id :venues :name))
                          (lib.metadata/field mp (mt/id :venues :price))]))))

(defn- venues-row-count
  "Run a Lib `count(*)` over venues through the QP and return the scalar."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count))
        qp/process-query mt/rows ffirst)))

(deftest run-transform!-ctas-rows-affected-reflects-rows-written-test
  ;; Characterizes the CTAS row count per driver. BigQuery, Snowflake, and Redshift are excluded; they
  ;; declare `:transforms/accurate-rows-affected false`, so the transforms layer skips emitting
  ;; efficiency metrics for their full-rebuild runs rather than trust the bogus count. New failing
  ;; driver → add the feature override + add it to this exclusion.
  #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :transforms/table)
                         :bigquery-cloud-sdk :redshift :snowflake)
    (mt/with-premium-features #{:transforms-basic}
      (let [schema  (t2/select-one-fn :schema :model/Table (mt/id :venues))
            written (venues-row-count)]
        (transforms.tu/with-transform-cleanup! [target {:type :table :schema schema
                                                        :name "ctas_rows_affected_probe"
                                                        :database (mt/id)}]
          (let [transform {:source {:type "query" :query (venues-source-query)}
                           :target target}
                details   {:db-id          (mt/id)
                           :database       (mt/db)
                           :transform-type :table
                           :conn-spec      (driver/connection-spec driver/*driver* (mt/db))
                           :query          (transforms-base.u/compile-source transform nil)
                           :output-schema  (:schema target)
                           :output-table   (transforms-base.u/qualified-table-name driver/*driver* target)}
                result    (driver/run-transform! driver/*driver* details {})]
            (is (= written (:rows-affected result))
                (format "%s: CTAS :rows-affected (%s) should equal %s — new failing driver → declare `:transforms/accurate-rows-affected false` and exclude"
                        driver/*driver* (pr-str (:rows-affected result)) written))))))))

(deftest run-transform!-insert-rows-affected-reflects-rows-written-test
  ;; Characterizes the INSERT row count per driver. First run creates the table (CTAS), second
  ;; goes through `compile-insert`. No exclusions — a failing driver also undercounts INSERTs.
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms-basic}
      (let [schema  (t2/select-one-fn :schema :model/Table (mt/id :venues))
            written (venues-row-count)]
        (transforms.tu/with-transform-cleanup! [target {:type :table :schema schema :name "insert_rows_affected_probe" :database (mt/id)}]
          (let [transform {:source {:type "query" :query (venues-source-query)}
                           :target target}
                details   {:db-id          (mt/id)
                           :database       (mt/db)
                           :transform-type :table-incremental
                           :conn-spec      (driver/connection-spec driver/*driver* (mt/db))
                           :query          (transforms-base.u/compile-source transform nil)
                           :output-schema  (:schema target)
                           :output-table   (transforms-base.u/qualified-table-name driver/*driver* target)}]
            (driver/run-transform! driver/*driver* details {})      ; first run = CTAS (creates the table)
            (let [insert-result (driver/run-transform! driver/*driver* details {})]   ; second run = INSERT
              (is (= written (:rows-affected insert-result))
                  (format "%s: INSERT :rows-affected (%s) should equal %s — failure means the driver also undercounts DML"
                          driver/*driver* (pr-str (:rows-affected insert-result)) written)))))))))
