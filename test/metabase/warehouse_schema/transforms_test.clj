(ns metabase.warehouse-schema.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.transforms :as warehouse-schema.transforms]))

(defn- write
  "The stored value `transforms` write for `value` of `column`."
  [transforms column value]
  ((get-in transforms [column :in]) value))

(defn- read-back
  "The value `transforms` read for the stored value `s` of `column`."
  [transforms column s]
  ((get-in transforms [column :out]) s))

(defn- write-error
  "The ex-data of writing `value` to `column` through `transforms`, or nil when the write succeeds."
  [transforms column value]
  (try
    (write transforms column value)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(deftest ^:parallel hierarchy-keyword-global-hierarchy-test
  (let [transforms {:semantic_type (warehouse-schema.transforms/hierarchy-keyword
                                    :model/Field :semantic_type
                                    :ancestor-types [:Semantic/* :Relation/*], :fallback-type nil)}]
    (testing "a write stores the qualified name"
      (is (= "type/PK" (write transforms :semantic_type :type/PK)))
      (is (= "type/PK" (write transforms :semantic_type "type/PK"))))
    (testing "a write outside the ancestor types throws a 400 that names the Field column"
      (is (=? {:status-code       400
               :errors            {:semantic_type #"Invalid value for Field column :semantic_type: .*"}
               :value             :type/Integer
               :allowed-ancestors [:Semantic/* :Relation/*]}
              (write-error transforms :semantic_type :type/Integer))))
    (testing "a stored value outside the ancestor types reads as the fallback"
      (is (= :type/PK (read-back transforms :semantic_type "type/PK")))
      (is (nil? (read-back transforms :semantic_type "type/Integer")))
      (is (nil? (read-back transforms :semantic_type ""))))))

(deftest ^:parallel hierarchy-keyword-own-hierarchy-test
  (let [transforms warehouse-schema.transforms/table-transforms]
    (testing "table_role checks the table role hierarchy, not the global one"
      (is (= "role/HistoryDimension" (write transforms :table_role :role/HistoryDimension)))
      (is (=? {:status-code 400
               :errors      {:table_role #"Invalid value for Table column :table_role: .*"}}
              (write-error transforms :table_role :type/PK)))
      (is (= :role/Fact (read-back transforms :table_role "role/Fact")))
      (is (nil? (read-back transforms :table_role "type/PK"))))))

(deftest ^:parallel enum-columns-test
  (let [transforms warehouse-schema.transforms/table-transforms]
    (doseq [[column good bad] [[:period_granularity :quarter "fortnight"]
                               [:mutability :append_only "append-only"]
                               [:load_strategy :cdc "upsert"]]]
      (testing column
        (is (= (name good) (write transforms column good)))
        (is (= (name good) (write transforms column (name good))))
        (is (nil? (write transforms column nil)))
        (is (=? {:status-code 400, :errors {column some?}, :value (keyword bad)}
                (write-error transforms column bad)))
        (is (= good (read-back transforms column (name good))))
        (is (nil? (read-back transforms column bad)))))))

(deftest ^:parallel json-columns-test
  (let [transforms warehouse-schema.transforms/table-transforms]
    (testing "a write stores JSON and a read decodes it with keyword keys"
      (let [stored (write transforms :history_definition {:durable_key 12, :valid_to nil})]
        (is (= {:durable_key 12, :valid_to nil} (json/decode+kw stored)))
        (is (= {:durable_key 12, :valid_to nil} (read-back transforms :history_definition stored)))))
    (testing "a write is not checked against the schema, and the read drops what fails it"
      (is (nil? (read-back transforms :eav_definition (write transforms :eav_definition {:entity_key 31, :value 32})))))
    (testing "a stored value that does not parse or fails the schema reads as nil"
      (is (nil? (read-back transforms :eav_definition "not json")))
      (is (nil? (read-back transforms :eav_definition "{\"value\":32}"))))))

(deftest ^:parallel facets-test
  (let [transforms warehouse-schema.transforms/field-transforms]
    (testing "a read keeps the valid facets and drops the others"
      (is (= [:type/EventTimestamp :type/DurableKey]
             (read-back transforms :facets
                        "[\"type/EventTimestamp\",\"type/NotAType\",\"type/DurableKey\",\"type/Flag\"]"))))
    (testing "stored facets that are all dropped read as nil, but stored empty facets read as empty"
      (is (nil? (read-back transforms :facets "[\"type/PK\"]")))
      (is (= [] (read-back transforms :facets "[]"))))
    (testing "stored facets that are not a JSON array read as nil"
      (is (nil? (read-back transforms :facets "{\"time\":\"type/EventTimestamp\"}")))
      (is (nil? (read-back transforms :facets "not json"))))
    (testing "a write is not checked against the schema, and the read drops what fails it"
      (is (= [:type/EventTimestamp]
             (read-back transforms :facets (write transforms :facets [:type/Category :type/EventTimestamp])))))))
