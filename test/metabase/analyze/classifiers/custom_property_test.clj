(ns metabase.analyze.classifiers.custom-property-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.custom-property :as classifiers.custom-property]
   [metabase.models.interface :as mi]
   [metabase.types.core :as types]))

(defn- field [id field-name base-type & {:as more}]
  (merge {:id id, :name field-name, :base_type base-type} more))

(defn- pk [id field-name base-type]
  (field id field-name base-type :semantic_type :type/PK :database_is_pk true))

(defn- fk [id field-name & {:as more}]
  (merge (field id field-name :type/Integer :semantic_type :type/FK) more))

(def ^:private ticket
  {:id 10, :name "ticket", :fields [(pk 101 "id" :type/Integer) (field 102 "subject" :type/Text)]})

(def ^:private ticket-field
  {:id 20, :name "ticket_field", :fields [(pk 201 "id" :type/Integer)
                                          (field 202 "name" :type/Text)
                                          (field 203 "title" :type/Text)
                                          (field 204 "type" :type/Text)]})

(defn- infer
  ([table-name fields]
   (infer table-name fields [ticket ticket-field]))
  ([table-name fields schema-tables]
   (classifiers.custom-property/infer-custom-property-binding
    table-name :role/CustomPropertyTable fields schema-tables)))

(deftest ^:parallel only-custom-property-tables-test
  (let [fields [(fk 1 "ticket_id" :fk_target_field_id 101)
                (fk 2 "field_id" :fk_target_field_id 201)
                (field 3 "value" :type/Text)]]
    (testing "a table whose role is not a custom-property table gets no binding, whatever its columns"
      (is (nil? (classifiers.custom-property/infer-custom-property-binding
                 "ticket_field_value" :role/TransactionFact fields [ticket ticket-field])))
      (is (nil? (classifiers.custom-property/infer-custom-property-binding
                 "ticket_field_value" nil fields [ticket ticket-field]))))
    (is (some? (infer "ticket_field_value" fields)))))

(deftest ^:parallel custom-property-role-has-no-descendants-test
  (testing "infer-custom-property-binding compares the role with `=`, which is only right while nothing derives from it"
    (is (empty? (descendants types/table-role-hierarchy :role/CustomPropertyTable)))))

(deftest ^:parallel definition-by-foreign-key-test
  (testing "the property column's foreign key reaches the definition table"
    (is (= {:binding    {:entity_key_field     1
                         :property_name_field  2
                         :property_value_field 3
                         :definition_table_id  20
                         :label_field          203
                         :type_field           204}
            :signal     "field_id links to ticket_field"
            :confidence :high}
           (infer "ticket_custom_values" [(fk 1 "ticket_id" :fk_target_field_id 101)
                                          (fk 2 "field_id" :fk_target_field_id 201)
                                          (field 3 "value" :type/Text)]))))
  (testing "the property column is found whatever the order of the foreign keys"
    (is (=? {:binding {:entity_key_field 2, :property_name_field 1}}
            (infer "x" [(fk 1 "field_id" :fk_target_field_id 201)
                        (fk 2 "ticket_id" :fk_target_field_id 101)
                        (field 3 "value" :type/Text)]))))
  (testing "a property column in a composite primary key still counts"
    (is (=? {:binding {:entity_key_field 1, :property_name_field 2, :definition_table_id 20}}
            (infer "x" [(fk 1 "ticket_id" :fk_target_field_id 101 :database_is_pk true)
                        (fk 2 "field_id" :fk_target_field_id 201 :database_is_pk true)
                        (field 3 "value" :type/Text)])))))

(deftest ^:parallel definition-by-sibling-name-test
  (testing "the value table's name without its suffix"
    (is (=? {:binding    {:property_name_field 2, :definition_table_id 30, :label_field 302, :type_field 303}
             :signal     "custom_field is named like custom_field_values without its suffix"
             :confidence :high}
            (infer "custom_field_values"
                   [(fk 1 "contact_id") (field 2 "custom_field_name" :type/Text) (field 3 "value" :type/Text)]
                   [{:id 30, :name "custom_field", :fields [(pk 301 "id" :type/Integer)
                                                            (field 302 "label" :type/Text)
                                                            (field 303 "data_type" :type/Text)]}]))))
  (testing "the value table's name without its `custom_` part"
    (is (=? {:binding {:definition_table_id 20, :label_field 203, :type_field 204}
             :signal  "ticket_field is named like ticket_custom_field without its suffix"}
            (infer "ticket_custom_field"
                   [(fk 1 "ticket_id") (field 2 "field_name" :type/Text) (field 3 "value" :type/Text)])))))

(deftest ^:parallel no-definition-table-test
  (is (= {:binding    {:entity_key_field     1
                       :property_name_field  2
                       :property_value_field 3
                       :definition_table_id  nil
                       :label_field          nil
                       :type_field           nil}
          :signal     "no table of field definitions was found"
          :confidence :low}
         (infer "contact_properties" [(fk 1 "contact_id") (field 2 "property_name" :type/Text) (field 3 "value" :type/Text)]))))

(deftest ^:parallel row-columns-test
  (testing "a non-key `_id` column is the entity key when no column is a foreign key"
    (is (=? {:binding {:entity_key_field 2}, :confidence :low}
            (infer "contact_properties" [(pk 1 "id" :type/Integer)
                                         (field 2 "contact_id" :type/Integer)
                                         (field 3 "key" :type/Text)
                                         (field 4 "value" :type/Text)]))))
  (testing "a lone primary key named like a property is the row's key, not its property"
    (is (=? {:binding    {:entity_key_field nil, :property_name_field nil, :property_value_field 2}
             :confidence :low}
            (infer "contact_properties" [(pk 1 "key" :type/Text) (field 2 "value" :type/Text)]))))
  (testing "a definition table without label or type columns leaves those pointers nil"
    (is (=? {:binding {:definition_table_id 40, :label_field nil, :type_field nil}}
            (infer "contact_properties"
                   [(fk 1 "contact_id") (fk 2 "property_id" :fk_target_field_id 401) (field 3 "value" :type/Text)]
                   [{:id 40, :name "property", :fields [(pk 401 "id" :type/Integer)]}])))))

(deftest ^:parallel find-target-table-test
  (are [fk-field expected] (= expected (:id (classifiers.custom-property/find-target-table fk-field [ticket ticket-field])))
    nil                                     nil
    (field 1 "ticket_id" :type/Integer)     nil
    (fk 1 "ticket_id" :fk_target_field_id 999) nil
    (fk 1 "ticket_id" :fk_target_field_id 101) 10
    (fk 1 "field_id" :fk_target_field_id 202)  20))

(deftest ^:parallel infer-custom-property-facet-test
  (are [field-name expected] (= expected (classifiers.custom-property/infer-custom-property-facet {:name field-name}))
    "property_amount"   {:prefix "property_", :suffix "amount"}
    "Custom_Region"     {:prefix "custom_", :suffix "region"}
    "custom_"           nil
    "amount"            nil
    "my_custom_region"  nil)
  (testing "synced Field instances are accepted as well as plain maps"
    (is (= {:prefix "property_", :suffix "createdate"}
           (classifiers.custom-property/infer-custom-property-facet
            (mi/instance :model/Field {:name "property_createdate", :base_type :type/DateTime}))))))

(deftest ^:parallel infer-wildcard-definition-table-test
  (let [deal-property {:id 50, :name "deal_property", :fields [(pk 501 "name" :type/Text)
                                                               (field 502 "label" :type/Text)
                                                               (field 503 "field_type" :type/Text)]}
        deal-stage    {:id 51, :name "deal_stage", :fields [(pk 511 "id" :type/Integer)
                                                            (field 512 "label" :type/Text)]}]
    (testing "a table named after the singular table name, with label and type columns"
      (is (= 50 (:id (classifiers.custom-property/infer-wildcard-definition-table "deals" [deal-stage deal-property]))))
      (is (= 50 (:id (classifiers.custom-property/infer-wildcard-definition-table "deal" [deal-stage deal-property])))))
    (testing "nil without a label and type column, or without the name prefix"
      (is (nil? (classifiers.custom-property/infer-wildcard-definition-table "deals" [deal-stage])))
      (is (nil? (classifiers.custom-property/infer-wildcard-definition-table "contacts" [deal-property])))
      (is (nil? (classifiers.custom-property/infer-wildcard-definition-table "deals" []))))))
