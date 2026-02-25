(ns metabase-enterprise.product-analytics.storage.iceberg.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.schema :as iceberg.schema])
  (:import
   (org.apache.iceberg PartitionSpec Schema)
   (org.apache.iceberg.types Types$IntegerType Types$LongType Types$MapType
                             Types$StringType Types$TimestampType)))

(set! *warn-on-reflection* true)

(defn- field-names
  "Extract field names from an Iceberg Schema."
  [^Schema schema]
  (set (map #(.name ^org.apache.iceberg.types.Types$NestedField %) (.columns schema))))

(defn- field-by-name
  "Look up a field by name in an Iceberg Schema."
  ^org.apache.iceberg.types.Types$NestedField [^Schema schema ^String name]
  (first (filter #(= name (.name ^org.apache.iceberg.types.Types$NestedField %)) (.columns schema))))

(deftest ^:parallel table-definitions-has-all-tables-test
  (testing "table-definitions has exactly 4 tables"
    (is (= #{:pa_events :pa_sessions :pa_sites :pa_session_data}
           (set (keys iceberg.schema/table-definitions))))))

(deftest ^:parallel events-schema-has-expected-fields-test
  (testing "Events schema has key fields with correct types"
    (let [schema iceberg.schema/events-schema
          names  (field-names schema)]
      (is (contains? names "event_id"))
      (is (contains? names "site_id"))
      (is (contains? names "created_at"))
      (is (contains? names "event_data"))
      (is (contains? names "event_name"))
      (is (contains? names "url_path"))
      (testing "event_id is LongType"
        (is (instance? Types$LongType (.type (field-by-name schema "event_id")))))
      (testing "site_id is IntegerType"
        (is (instance? Types$IntegerType (.type (field-by-name schema "site_id")))))
      (testing "created_at is TimestampType"
        (is (instance? Types$TimestampType (.type (field-by-name schema "created_at")))))
      (testing "event_data is MapType"
        (is (instance? Types$MapType (.type (field-by-name schema "event_data"))))))))

(deftest ^:parallel sessions-schema-has-expected-fields-test
  (testing "Sessions schema has key fields"
    (let [schema iceberg.schema/sessions-schema
          names  (field-names schema)]
      (is (contains? names "session_id"))
      (is (contains? names "browser"))
      (is (contains? names "country"))
      (is (contains? names "os"))
      (is (contains? names "created_at"))
      (testing "session_id is LongType"
        (is (instance? Types$LongType (.type (field-by-name schema "session_id")))))
      (testing "browser is StringType"
        (is (instance? Types$StringType (.type (field-by-name schema "browser"))))))))

(deftest ^:parallel sites-schema-has-expected-fields-test
  (testing "Sites schema has key fields"
    (let [schema iceberg.schema/sites-schema
          names  (field-names schema)]
      (is (contains? names "id"))
      (is (contains? names "uuid"))
      (is (contains? names "name"))
      (testing "id is IntegerType"
        (is (instance? Types$IntegerType (.type (field-by-name schema "id")))))
      (testing "uuid is StringType"
        (is (instance? Types$StringType (.type (field-by-name schema "uuid"))))))))

(deftest ^:parallel partition-specs-test
  (testing "Events partitioned by day(created_at) and site_id"
    (let [^PartitionSpec spec iceberg.schema/events-partition-spec
          fields (.fields spec)]
      (is (= 2 (count fields)))
      (is (= "created_at_day" (.name ^org.apache.iceberg.PartitionField (first fields))))
      (is (= "site_id" (.name ^org.apache.iceberg.PartitionField (second fields))))))
  (testing "Sessions partitioned by day(created_at)"
    (let [^PartitionSpec spec iceberg.schema/sessions-partition-spec
          fields (.fields spec)]
      (is (= 1 (count fields)))
      (is (= "created_at_day" (.name ^org.apache.iceberg.PartitionField (first fields))))))
  (testing "Sites are unpartitioned"
    (is (.isUnpartitioned ^PartitionSpec iceberg.schema/sites-partition-spec))))
