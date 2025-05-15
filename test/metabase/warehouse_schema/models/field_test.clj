(ns metabase.warehouse-schema.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field :as field]
   [toucan2.core :as t2]))

(deftest unknown-types-test
  (doseq [{:keys [column unknown-type fallback-type]} [{:column        :base_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :effective_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :semantic_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type nil}
                                                       {:column        :coercion_strategy
                                                        :unknown-type  :Coercion/Amazing
                                                        :fallback-type nil}]]
    (testing (format "Field with unknown %s in DB should fall back to %s" column fallback-type)
      (mt/with-temp [:model/Field field]
        (t2/query-one {:update :metabase_field
                       :set    {column (u/qualified-name unknown-type)}
                       :where  [:= :id (u/the-id field)]})
        (is (= fallback-type
               (t2/select-one-fn column :model/Field :id (u/the-id field))))))
    (testing (format "Should throw an Exception if you attempt to save a Field with an invalid %s" column)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           (re-pattern (format "Invalid value for Field column %s: %s is not a descendant of any of these types:"
                               column unknown-type))
           (mt/with-temp [:model/Field field {column unknown-type}]
             field))))))

(deftest identity-hash-test
  (testing "Field hashes are composed of the name, the table's identity-hash, and the parent's identity-hash"
    (mt/with-temp [:model/Database db    {:name "field-db" :engine :h2}
                   :model/Table    table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                   :model/Field    field {:name "sku" :table_id (:id table)}]
      (let [table-hash (serdes/identity-hash table)]
        (is (= "edc06d97"
               (serdes/raw-hash ["sku" table-hash "<none>"])
               (serdes/identity-hash field)))))))

(deftest nested-field-names->field-id-test
  (mt/with-temp
    [:model/Database {db-id :id}              {}
     :model/Table    {table-id :id}           {:db_id db-id}
     :model/Field    {top-level-field-id :id} {:name    "top"
                                               :table_id table-id}
     :model/Field    {nested-field-id :id}    {:name    "nested"
                                               :table_id table-id
                                               :parent_id top-level-field-id}]
    (testing "happy path"
      (is (= top-level-field-id
             (field/nested-field-names->field-id table-id ["top"])))
      (is (= nested-field-id
             (field/nested-field-names->field-id table-id ["top" "nested"]))))

    (testing "return nothing if field does not exist"
      (is (= nil
             (field/nested-field-names->field-id table-id ["top" "nested" "not-exists"]))))))

(deftest nested-fields-with-duplicate-names-test
  (mt/with-temp
    [:model/Database {db-id :id} {:name "field-db", :engine :h2}
     :model/Table    table       {:schema  "PUBLIC"
                                  :name    "widget"
                                  :db_id   db-id}
     :model/Field    parent1     {:name    "parent1"
                                  :table_id (:id table)}
     :model/Field    parent2     {:name    "parent2"
                                  :table_id (:id table)}
     ;; These two have the same name but different parents.
     :model/Field    child1      {:name      "child"
                                  :table_id  (:id table)
                                  :parent_id (:id parent1)}
     :model/Field    child2      {:name      "child"
                                  :table_id  (:id table)
                                  :parent_id (:id parent2)}]
    (testing "nested fields with the same name and different parents have unique identity-hashes"
      (is (= "204a7209"
             (serdes/raw-hash ["parent1" (serdes/identity-hash table) "<none>"])
             (serdes/identity-hash parent1)))
      (is (= "be1bb68e"
             (serdes/raw-hash ["parent2" (serdes/identity-hash table) "<none>"])
             (serdes/identity-hash parent2)))
      (is (= "7f203b41"
             (serdes/raw-hash ["child" (serdes/identity-hash table) (serdes/identity-hash parent1)])
             (serdes/identity-hash child1)))
      (is (= "913269d5"
             (serdes/raw-hash ["child" (serdes/identity-hash table) (serdes/identity-hash parent2)])
             (serdes/identity-hash child2))))))
