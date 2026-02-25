(ns metabase-enterprise.product-analytics.storage.iceberg.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.schema :as iceberg.schema])
  (:import
   (org.apache.iceberg PartitionSpec Schema)
   (org.apache.iceberg.types Types$IntegerType Types$LongType
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
      (is (contains? names "event_name"))
      (is (contains? names "url_path"))
      (testing "event_id is LongType"
        (is (instance? Types$LongType (.type (field-by-name schema "event_id")))))
      (testing "site_id is IntegerType"
        (is (instance? Types$IntegerType (.type (field-by-name schema "site_id")))))
      (testing "created_at is TimestampType"
        (is (instance? Types$TimestampType (.type (field-by-name schema "created_at"))))))))

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
  (testing "All tables are unpartitioned (writer doesn't support partitioned writes yet)"
    (is (.isUnpartitioned ^PartitionSpec iceberg.schema/events-partition-spec))
    (is (.isUnpartitioned ^PartitionSpec iceberg.schema/sessions-partition-spec))
    (is (.isUnpartitioned ^PartitionSpec iceberg.schema/sites-partition-spec))
    (is (.isUnpartitioned ^PartitionSpec iceberg.schema/session-data-partition-spec))))
