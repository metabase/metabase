(ns metabase.analyze.classifiers.name-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.name :as classifiers.name]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table :refer [Table]]))

(deftest ^:paralell semantic-type-for-name-and-base-type-test
  (doseq [[input expected] {["id"      :type/Integer] :type/PK
                            ;; other pattern matches based on type/regex (remember, base_type matters in matching!)
                            ["rating"        :type/Integer] :type/Score
                            ["rating"        :type/Boolean] nil
                            ["country"       :type/Text]    :type/Country
                            ["country"       :type/Integer] nil
                            ["lat"           :type/Float]   :type/Latitude
                            ["latitude"      :type/Float]   :type/Latitude
                            ["foo_latitude"  :type/Float]   :type/Latitude
                            ["foo_lat"       :type/Float]   :type/Latitude}]
    (testing (pr-str (cons 'semantic-type-for-name-and-base-type input))
      (is (= expected
             (apply #'classifiers.name/semantic-type-for-name-and-base-type input))))))

(deftest ^:parallel infer-entity-type-test
  (testing "name matches"
    (let [classify (fn [table-name] (-> (mi/instance Table {:name table-name})
                                        classifiers.name/infer-entity-type
                                        :entity_type))]
      (testing "matches simple"
        (is (= :entity/TransactionTable
               (classify "MY_ORDERS"))))
      (testing "matches prefix"
        (is (= :entity/ProductTable
               (classify "productcatalogue"))))
      (testing "doesn't match in the middle"
        (is (= :entity/GenericTable
               (classify "myproductcatalogue"))))
      (testing "defaults to generic table"
        (is (= :entity/GenericTable
               (classify "foo")))))))

(deftest ^:parallel infer-entity-type-test-2
  (testing "When using field info"
    (testing "doesn't infer on PK/FK semantic_types"
      (is (nil? (-> {:semantic_type :type/FK
                     :name          "City"
                     :base_type     :type/Text}
                    (classifiers.name/infer-and-assoc-semantic-type nil)
                    :semantic_type))))))

(deftest ^:parallel infer-entity-type-test-3
  (testing "When using field info"
    (testing "infers on non-PK/FK fields"
      (is (= :type/City
             (-> {:semantic_type :type/Category
                  :name          "City"
                  :base_type     :type/Text}
                 (classifiers.name/infer-and-assoc-semantic-type nil)
                 :semantic_type))))))

(deftest ^:parallel infer-semantic-type-test
  (let [infer (fn infer [column-name & [base-type]]
                (classifiers.name/infer-semantic-type
                  {:name column-name, :base_type (or base-type :type/Text)}))]
    (testing "standard checks"
      ;; not exhausting but a place for edge cases in the future
      (are [expected info] (= expected (apply infer info))
        :type/Name     ["first_name"]
        :type/Name     ["name"]
        :type/Quantity ["quantity" :type/Integer]))
    (testing "name and type matches"
      (testing "matches \"updated at\" style columns"
        (let [classify (fn [table-name table-type] (-> (mi/instance Table {:name table-name :base_type table-type})
                                                       classifiers.name/infer-semantic-type))]
          (doseq [[col-type expected] [[:type/Date :type/UpdatedDate]
                                       [:type/DateTime :type/UpdatedTimestamp]
                                       [:type/Time :type/UpdatedTime]]]
            (doseq [column-name ["updated_at" "updated" "updated-at"]]
              (is (= expected (classify column-name col-type))))))))
    (testing "Doesn't mark state columns (#2735)"
      (doseq [column-name ["state" "order_state" "state_of_order"]]
        (is (not= :type/State (infer column-name)))))))
