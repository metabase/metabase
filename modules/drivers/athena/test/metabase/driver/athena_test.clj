(ns metabase.driver.athena-test
  (:require [clojure.test :refer :all]
            [metabase.driver.athena :as athena]))

#_(def ^:private nested-schema_str
  "key                  int                   from deserializer
data                  struct<name:string>   from deserializer")

(def ^:private nested-schema
  [{:col_name "key", :data_type "int"}
   {:col_name "data", :data_type "struct<name:string>"}])

(def ^:private flat-schema-columns
  [{:column_name "id", :type_name  "string"}
   {:column_name "ts", :type_name "string"}])

(deftest sync-test
  (testing "sync with nested fields"
    (with-redefs [metabase.driver.athena/run-query (constantly nested-schema)]
      (is (=
           #{{:name              "key"
              :base-type         :type/Integer
              :database-type     "int"
              :database-position 0}
             {:name              "data"
              :base-type         :type/Dictionary
              :database-type     "struct"
              :nested-fields     #{{:name "name", :base-type :type/Text, :database-type "string", :database-position 1}},
              :database-position 1}}
           (athena/sync-table-with-nested-field "test" "test" "test")))))
  (testing "sync without nested fields"
    (is (= #{{:name "id", :base-type :type/Text, :database-type "string", :database-position 0}
             {:name "ts", :base-type :type/Text, :database-type "string", :database-position 1}}
           (athena/sync-table-without-nested-field :athena flat-schema-columns)))))

(deftest ^:parallel endpoint-test
  (testing "AWS Endpoint URL"
    (are [region endpoint] (= endpoint
                              (athena/endpoint-for-region region))
      "us-east-1"      ".amazonaws.com"
      "us-west-2"      ".amazonaws.com"
      "cn-north-1"     ".amazonaws.com.cn"
      "cn-northwest-1" ".amazonaws.com.cn")))
