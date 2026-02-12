(ns ^:mb/driver-tests metabase.driver.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel base-type-inference-test
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" "B" "C"])))
  (testing "should work with just one value"
    (is (= :type/Text
           (transduce identity (driver.common/values->base-type) ["A"]))))
  (testing "should work with just one value"
    (is (= :type/*
           (transduce identity (driver.common/values->base-type) []))))
  (testing "should work with a lot of values"
    (is (= :type/Integer
           (transduce identity (driver.common/values->base-type) (range 10000)))))
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" 100 "C"])))
  (is (= :type/*
         (transduce identity (driver.common/values->base-type) [(Object.)])))
  (testing "Base type inference should work with initial nils even if sequence is lazy"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [nil nil nil]
                                                                              (do (reset! realized-lazy-seq? true)
                                                                                  [4 5 6])))
              @realized-lazy-seq?]))))
  (testing "Base type inference should respect laziness and not keep scanning after it finds 100 values"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [1 2 3]
                                                                              (repeat 1000 nil)
                                                                              (do (reset! realized-lazy-seq? true)
                                                                                  [4 5 6])))
              @realized-lazy-seq?])))))

(defn- test-start-of-week-offset!
  [db-start-of-week target-start-of-week]
  (with-redefs [driver/db-start-of-week   (constantly db-start-of-week)
                setting/get-value-of-type (constantly target-start-of-week)]
    (driver.common/start-of-week-offset :sql)))

(deftest start-of-week-offset-test
  (is (= 0 (test-start-of-week-offset! :sunday :sunday)))
  (is (= -1 (test-start-of-week-offset! :sunday :monday)))
  (is (= 1 (test-start-of-week-offset! :monday :sunday)))
  (is (= 5 (test-start-of-week-offset! :monday :wednesday))))

(deftest cloud-ip-address-info-test
  (testing "The cloud-ip-address-info field is correctly resolved when fetching driver connection properties"
    (mt/with-temp-env-var-value! [mb-cloud-gateway-ips "1.2.3.4,5.6.7.8"]
      (with-redefs [premium-features/is-hosted? (constantly true)]
        ;; make sure Postgres driver is initialized before trying to get its connection properties.
        (driver/the-initialized-driver :postgres)
        (let [connection-props (-> (driver.u/available-drivers-info)
                                   :postgres
                                   :details-fields)
              ip-address-field (first (filter #(= (:name %) "cloud-ip-address-info") connection-props))]
          (is (re-find #"If your database is behind a firewall" (:placeholder ip-address-field))))))))

(deftest ^:parallel json-unfolding-default-test
  (testing "JSON Unfolding database support details behave as they're supposed to"
    #_{:clj-kondo/ignore [:equals-true]}
    (are [details expected] (= expected
                               (driver.common/json-unfolding-default
                                {:lib/type :metadata/database
                                 :details details}))
      {}                      true
      {:json-unfolding nil}   true
      {:json-unfolding true}  true
      {:json-unfolding false} false)))

(deftest ^:parallel json-decimals-keep-precision-test
  (testing "json fields with decimals maintain their decimal places"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (mt/dataset (mt/dataset-definition "json-decimals-db"
                                         [["json-decimals-table"
                                           [{:field-name "json-field" :base-type :type/JSON}]
                                           [["{\"A\": 123, \"B\": 0.456, \"C\": 0.789}"]
                                            ["{\"A\": 456, \"B\": 0.789, \"C\": 789}"]]]])
        (when-not (mysql/mariadb? (mt/db))
          (is (= [[1 123.0 0.456 0.789]
                  [2 456.0 0.789 789.0]]
                 (mt/formatted-rows [int double double double]
                                    (mt/run-mbql-query json-decimals-table)))))))))

(defn- base-type-test-data
  "Base types that all drivers should support with test data."
  [driver]
  {:columns [{:name "id" :type :type/Integer :nullable? false}
             {:name "name" :type :type/Text :nullable? true}
             {:name "price" :type :type/Float :nullable? true}
             {:name "active" :type :type/Boolean :nullable? true}
             {:name "created_date" :type :type/Date :nullable? true}
             {:name "created_at" :type :type/DateTime :nullable? true}]
   :data [[1 "Product A" 19.99 (if (= :sqlserver driver) 1 true) "2024-01-01" "2024-01-01T12:00:00"]
          [2 "Product B" 15.50 (if (= :sqlserver driver) 1 false) "2024-02-01" "2024-02-01T09:15:30"]
          [3 nil nil nil nil nil]]})

(deftest insert-from-source!-test
  (mt/test-drivers  #{:postgres :h2 :mysql :bigquery-cloud-sdk :redshift :snowflake :sqlserver :mongo :clickhouse}
    (mt/with-empty-db
      (let [driver       driver/*driver*
            db-id        (mt/id)
            table-name   (mt/random-name)
            schema-name  (when (get-method sql.tx/session-schema driver) (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
            {:keys [columns data]} (base-type-test-data driver)
            column-definitions (into {} (map (fn [{:keys [name type]}]
                                               [name (driver/type->database-type driver type)]))
                                     columns)]
        (mt/as-admin
          (try
            (driver/create-table! driver db-id qualified-table-name column-definitions {})

            (testing "insert-from-source! should insert rows with all basic types correctly"
              (let [data-source {:type :rows :data data}
                    _ (driver/insert-from-source! driver db-id
                                                  {:name qualified-table-name
                                                   :columns columns}
                                                  data-source)]
                (when-let [inserted-rows (and (not (#{:bigquery-cloud-sdk :snowflake :mongo} driver)) ;table-rows-seq not implemented
                                              (driver/table-rows-seq driver/*driver* (mt/db) {:name table-name
                                                                                              :schema schema-name}))]
                  (is (= (count data) (count inserted-rows)) "Should insert all test rows including nulls"))))
            (finally
              (driver/drop-table! driver db-id qualified-table-name))))))))

(deftest insert-from-jsonl-file-test
  (mt/test-drivers #{:postgres :h2 :mysql :bigquery-cloud-sdk :redshift :snowflake :sqlserver :mongo :clickhouse}
    (mt/with-empty-db
      (let [driver       driver/*driver*
            db-id        (mt/id)
            table-name   (mt/random-name)
            schema-name  (when (get-method sql.tx/session-schema driver) (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
            {:keys [columns data]} (base-type-test-data driver)
            column-definitions (into {} (map (fn [{:keys [name type]}]
                                               [name (driver/type->database-type driver type)]))
                                     columns)]
        (mt/as-admin
          (try
            (driver/create-table! driver db-id qualified-table-name column-definitions {})

            (testing "insert-from-source! should insert rows from JSONL file correctly"
              (let [temp-file (java.io.File/createTempFile "test-data" ".jsonl")
                    col-names (map :name columns)

                    json-rows (map (fn [row]
                                     (into {} (map vector col-names row)))
                                   data)]
                (try

                  (with-open [writer (java.io.FileWriter. temp-file)]
                    (doseq [row json-rows]
                      (.write writer (str (json/encode row) "\n"))))

                  (let [data-source {:type :jsonl-file :file temp-file}
                        _ (driver/insert-from-source! driver db-id
                                                      {:name qualified-table-name
                                                       :columns columns}
                                                      data-source)]
                    (when-let [inserted-rows (and (not (#{:bigquery-cloud-sdk :snowflake :mongo} driver)) ;table-rows-seq not implemented
                                                  (driver/table-rows-seq driver/*driver* (mt/db) {:name table-name
                                                                                                  :schema schema-name}))]
                      (is (= (count data) (count inserted-rows))
                          "Should insert all test rows from JSONL file including nulls")))
                  (finally
                    (.delete temp-file)))))
            (finally
              (driver/drop-table! driver db-id qualified-table-name))))))))

(deftest ^:parallel type->database-type-h2-test
  (mt/test-driver :h2
    (testing "type->database-type multimethod returns correct H2 types"
      (are [base-type expected] (= expected (driver/type->database-type :h2 base-type))
        :type/Boolean            [:boolean]
        :type/Date               [:date]
        :type/DateTime           [:timestamp]
        :type/DateTimeWithTZ     [:timestamp-with-time-zone]
        :type/Float              [(keyword "DOUBLE PRECISION")]
        :type/Integer            [:int]
        :type/Number             [:bigint]
        :type/Text               [:varchar]
        :type/Time               [:time]
        :type/UUID               [:uuid]))))

(deftest ^:parallel type->database-type-mysql-test
  (mt/test-driver :mysql
    (testing "type->database-type multimethod returns correct MySQL types"
      (are [base-type expected] (= expected (driver/type->database-type :mysql base-type))
        :type/Boolean            [:boolean]
        :type/Date               [:date]
        :type/DateTime           [:datetime]
        :type/DateTimeWithTZ     [:timestamp]
        :type/Float              [:double]
        :type/Decimal            [:decimal]
        :type/Integer            [:int]
        :type/Number             [:bigint]
        :type/Text               [:text]
        :type/Time               [:time]))))

(deftest ^:parallel type->database-type-postgres-test
  (mt/test-driver :postgres
    (testing "type->database-type multimethod returns correct PostgreSQL types"
      (are [base-type expected] (= expected (driver/type->database-type :postgres base-type))
        :type/Boolean            [:boolean]
        :type/Date               [:date]
        :type/DateTime           [:timestamp]
        :type/DateTimeWithTZ     [:timestamp-with-time-zone]
        :type/Decimal            [:decimal]
        :type/Float              [:float]
        :type/Integer            [:int]
        :type/JSON               [:jsonb]
        :type/Number             [:bigint]
        :type/SerializedJSON     [:jsonb]
        :type/Text               [:text]
        :type/Time               [:time]
        :type/TimeWithTZ         [:time-with-time-zone]
        :type/UUID               [:uuid]))))
