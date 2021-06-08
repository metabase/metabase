(ns metabase.sync.analyze.classifiers.name-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.sync.analyze.classifiers.name :as classify.names]
            [metabase.test :as mt]))

(deftest semantic-type-for-name-and-base-type-test
  (doseq [[input expected] {["id"      :type/Integer] :type/PK
                            ;; other pattern matches based on type/regex (remember, base_type matters in matching!)
                            ["rating"  :type/Integer] :type/Score
                            ["rating"  :type/Boolean] nil
                            ["country" :type/Text]    :type/Country
                            ["country" :type/Integer] nil}]
    (testing (pr-str (cons 'semantic-type-for-name-and-base-type input))
      (is (= expected
             (apply #'classify.names/semantic-type-for-name-and-base-type input))))))

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
      (mt/with-temp* [Table [{table-id :id}]
                      Field [{field-id :id} {:table_id      table-id
                                             :semantic_type :type/FK
                                             :name          "City"
                                             :base_type     :type/Text}]]
        (is (nil? (-> field-id Field (classify.names/infer-and-assoc-semantic-type nil) :semantic_type)))))
    (testing "but does infer on non-PK/FK fields"
      (mt/with-temp* [Table [{table-id :id}]
                      Field [{field-id :id} {:table_id      table-id
                                             :semantic_type :type/Category
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
        :type/Name     ["first_name"]
        :type/Name     ["name"]
        :type/Quantity ["quantity" :type/Integer]))
    (testing "name and type matches"
      (testing "matches \"updated at\" style columns"
        (let [classify (fn [table-name table-type] (-> {:name table-name :base_type table-type}
                                                       table/map->TableInstance
                                                       classify.names/infer-semantic-type))]
          (doseq [[col-type expected] [[:type/Date :type/UpdatedDate]
                                       [:type/DateTime :type/UpdatedTimestamp]
                                       [:type/Time :type/UpdatedTime]]]
            (doseq [column-name ["updated_at" "updated" "updated-at"]]
              (is (= expected (classify column-name col-type))))))))
    (testing "Doesn't mark state columns (#2735)"
      (doseq [column-name ["state" "order_state" "state_of_order"]]
        (is (not= :type/State (infer column-name)))))))
