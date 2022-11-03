(ns metabase.driver.athena-test
  (:require [clojure.test :refer :all]
            [metabase.driver.athena :refer [endpoint-for-region sync-table-with-nested-field sync-table-without-nested-field]]))

(def nested_schema_str
  "key                 	int                 	from deserializer
data                	struct<name:string> 	from deserializer")

(def nested_schema
  [{:col_name "key", :data_type "int"}
   {:col_name "data", :data_type "struct<name:string>"}])

(def flat_schema_columns
  [{:column_name "id", :type_name  "string"}
   {:column_name "ts", :type_name "string"}])

(deftest syncer
  (testing "sync with nested fields"
    (with-redefs [metabase.driver.athena/run-query (fn [_ _] nested_schema)]
      (is (=
           #{{:name "key", :base-type :type/Integer, :database-type "int", :database-position 0}
             {:name "data", :base-type :type/Dictionary, :database-type "struct"
              :nested-fields #{{:name "name", :base-type :type/Text, :database-type "string", :database-position 1}}, :database-position 1}}
           (sync-table-with-nested-field "test" "test" "test")))))

  (testing "sync without nested fields"
    (is (=
         #{{:name "id", :base-type :type/Text, :database-type "string", :database-position 0}
           {:name "ts", :base-type :type/Text, :database-type "string", :database-position 1}}
         (sync-table-without-nested-field :athena flat_schema_columns)))))

(deftest endpoint
  (testing "AWS Endpoint URL"
    (is (=
         ".amazonaws.com"
         (endpoint-for-region "us-east-1")))

    (is (=
         ".amazonaws.com"
         (endpoint-for-region "us-west-2")))

    (is (=
         ".amazonaws.com.cn"
         (endpoint-for-region "cn-north-1")))

    (is (=
         ".amazonaws.com.cn"
         (endpoint-for-region "cn-northwest-1")))))
