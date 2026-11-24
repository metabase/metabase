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
        (is (=? {:status-code 400, :errors {column some?}, :value bad}
                (write-error transforms column bad)))
        (is (= good (read-back transforms column (name good))))
        (is (nil? (read-back transforms column bad)))))))

(deftest ^:parallel json-columns-test
  (let [transforms warehouse-schema.transforms/table-transforms]
    (testing "a write stores JSON and a read decodes it with keyword keys"
      (let [stored (write transforms :history_definition {:durable_key 12, :valid_to nil})]
        (is (= {:durable_key 12, :valid_to nil} (json/decode+kw stored)))
        (is (= {:durable_key 12, :valid_to nil} (read-back transforms :history_definition stored)))))
    (testing "a write that fails the schema throws a 400"
      (is (=? {:status-code 400, :errors {:eav_definition some?}}
              (write-error transforms :eav_definition {:entity_key 31, :value 32}))))
    (testing "a stored value that does not parse or fails the schema reads as nil"
      (is (nil? (read-back transforms :eav_definition "not json")))
      (is (nil? (read-back transforms :eav_definition "{\"value\":32}"))))))

(deftest ^:parallel facets-test
  (let [transforms warehouse-schema.transforms/field-transforms]
    (testing "a read keeps the valid facets and drops the others"
      (is (= {:time :type/EventTimestamp}
             (read-back transforms :facets
                        "{\"time\":\"type/EventTimestamp\",\"key\":\"type/NotAType\",\"color\":\"type/Category\"}"))))
    (testing "stored facets that are not a JSON object read as nil"
      (is (nil? (read-back transforms :facets "[\"type/Category\"]")))
      (is (nil? (read-back transforms :facets "not json"))))
    (testing "a write with an unknown facet throws a 400"
      (is (=? {:status-code 400, :errors {:facets some?}}
              (write-error transforms :facets {:color :type/Category}))))))

(deftest ^:parallel check-values-test
  (testing "scd_type is 0 to 7"
    (is (nil? (warehouse-schema.transforms/check-table-values {:scd_type 7})))
    (is (nil? (warehouse-schema.transforms/check-table-values {:scd_type nil})))
    (is (=? {:status-code 400, :errors {:scd_type some?}, :value 8}
            (try (warehouse-schema.transforms/check-table-values {:scd_type 8})
                 nil
                 (catch clojure.lang.ExceptionInfo e (ex-data e))))))
  (testing "attribute_scd_type is 0 to 3"
    (is (nil? (warehouse-schema.transforms/check-field-values {:attribute_scd_type 3})))
    (is (=? {:status-code 400, :errors {:attribute_scd_type some?}, :value 4}
            (try (warehouse-schema.transforms/check-field-values {:attribute_scd_type 4})
                 nil
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
