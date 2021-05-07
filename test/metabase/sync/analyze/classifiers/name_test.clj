(ns metabase.sync.analyze.classifiers.name-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.sync.analyze.classifiers.name :as classify.names]
            [toucan.util.test :as tt]))

(deftest infer-entity-type-test
  (testing "name matches"
    (let [classify (fn [table-name] (-> {:name table-name}
                                        table/map->TableInstance
                                        classify.names/infer-entity-type
                                        :entity_type))]
      (testing "matches simple"
        (is (= :entity/TransactionTable (classify "MY_ORDERS"))))
      (testing "matches prefix"
        (is (= :entity/ProductTable (classify "productcatalogue"))))
      (testing "doesn't match in the middle"
        (is (= :entity/GenericTable (classify "myproductcatalogue"))))
      (testing "defaults to generic table"
        (is (= :entity/GenericTable (classify "foo"))))))
  (testing "When using field info"
    (testing "doesn't infer on PK/FK semantic_types"
      (tt/with-temp* [Table [{table-id :id}]
                      Field [{field-id :id} {:table_id      table-id
                                             :semantic_type :Relation/FK
                                             :name          "City"
                                             :base_type     :type/Text}]]
        (is (nil? (-> field-id Field (classify.names/infer-and-assoc-semantic-type nil) :semantic_type)))))
    (testing "but does infer on non-PK/FK fields"
      (tt/with-temp* [Table [{table-id :id}]
                      Field [{field-id :id} {:table_id      table-id
                                             :semantic_type :Semantic/Category
                                             :name          "City"
                                             :base_type     :type/Text}]]
        (-> field-id Field (classify.names/infer-and-assoc-semantic-type nil) :semantic_type)))))

(deftest infer-semantic-type-test
  (let [infer (fn infer [column-name & [base-type]]
                (classify.names/infer-semantic-type
                  {:name column-name, :base_type (or base-type :type/Text)}))]
    (testing "standard checks"
      ;; not exhausting but a place for edge cases in the future
      (are [expected info] (= expected (apply infer info))
        :Semantic/Name     ["first_name"]
        :Semantic/Name     ["name"]
        :Semantic/Quantity ["quantity" :type/Integer]))
    (testing "name and type matches"
      (testing "matches \"updated at\" style columns"
        (let [classify (fn [table-name table-type] (-> {:name table-name :base_type table-type}
                                                       table/map->TableInstance
                                                       classify.names/infer-semantic-type))]
          (doseq [[col-type expected] [[:type/Date :Semantic/UpdatedDate]
                                       [:type/DateTime :Semantic/UpdatedTimestamp]
                                       [:type/Time :Semantic/UpdatedTime]]]
            (doseq [column-name ["updated_at" "updated" "updated-at"]]
              (is (= expected (classify column-name col-type))))))))
    (testing "Doesn't mark state columns (#2735)"
      (doseq [column-name ["state" "order_state" "state_of_order"]]
        (is (not= :Semantic/State (infer column-name)))))))
