(ns metabase.models.params.custom-values-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card Collection]]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; --------------------------------------------- source=card ----------------------------------------------

(deftest ^:parallel with-mbql-card-test
  (doseq [model? [true false]]
    (testing (format "source card is a %s" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (testing "with simple mbql"
          (mt/with-temp
            [Card {card-id :id} (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                       {:database_id     (mt/id)
                                        :type            (if model? :model :question)
                                        :table_id        (mt/id :venues)})]
            (testing "get values"
              (is (= {:has_more_values true
                      :values          [["20th Century Cafe"] ["25°"] ["33 Taps"]]}
                     (custom-values/values-from-card
                      (t2/select-one Card :id card-id)
                      (mt/$ids $venues.name)))))
            (testing "case in-sensitve search test"
              (is (= {:has_more_values false
                      :values          [["Liguria Bakery"] ["Noe Valley Bakery"]]}
                     (custom-values/values-from-card
                      (t2/select-one Card :id card-id)
                      (mt/$ids $venues.name)
                      "bakery"))))))))))

(deftest ^:parallel with-mbql-card-test-2
  (testing "source card is a model" ; Models are opaque, so this sees the post-aggregation columns.
    (binding [custom-values/*max-rows* 3]
      (testing "has aggregation column"
        (mt/with-temp
          [Card {card-id :id} (merge (mt/card-with-source-metadata-for-query
                                       (mt/mbql-query venues
                                                      {:aggregation [[:sum $venues.price]]
                                                       :breakout    [[:field %categories.name {:source-field %venues.category_id}]]}))
                                     {:database_id     (mt/id)
                                      :type            :model
                                      :table_id        (mt/id :venues)})]
          (testing "get values from breakout columns"
            (is (= {:has_more_values true
                    :values          [["American"] ["Artisan"] ["Asian"]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field "NAME" {:base-type :type/Text}]))))
          (testing "get values from aggregation column"
            (is (= {:has_more_values true
                    :values          [[1] [2] [3]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field "sum" {:base-type :type/Float}]))))
          (testing "can search on aggregation column"
            (is (= {:has_more_values false
                    :values          [[2]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field "sum" {:base-type :type/Float}]
                     2))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Bakery"]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field "NAME" {:base-type :type/Text}]
                     "bakery"))))))))

  (testing "source card is a question" ; Questions are transparent, so this can drop the aggregations and filter the original.
    (binding [custom-values/*max-rows* 3]
      (testing "has aggregation column"
        (mt/with-temp
          [Card {card-id :id} (merge (mt/card-with-source-metadata-for-query
                                       (mt/mbql-query venues
                                                      {:aggregation [[:sum $venues.price]]
                                                       :breakout    [[:field %categories.name {:source-field %venues.category_id}]]}))
                                     {:database_id     (mt/id)
                                      :type            :question
                                      :table_id        (mt/id :venues)})]
          (testing "get values from breakout columns"
            (is (= {:has_more_values true
                    :values          [["American"] ["Artisan"] ["Asian"]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Bakery"]]}
                   (custom-values/values-from-card
                     (t2/select-one Card :id card-id)
                     [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]
                     "bakery")))))))))

(deftest ^:parallel with-mbql-card-test-3
  (doseq [model? [true false]]
    (testing (format "source card is a %s" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (testing "should disable remapping when getting fk columns"
          (mt/with-column-remappings [venues.category_id categories.name]
            (mt/with-temp
              [Card {card-id :id} (merge (mt/card-with-source-metadata-for-query
                                          (mt/mbql-query venues
                                                         {:joins [{:source-table $$categories
                                                                   :alias        "Categories"
                                                                   :condition    [:= $venues.category_id &Categories.categories.id]}]}))
                                         {:type (if model? :model :question)})]
              (testing "get values returns the value, not remapped values"
                (is (= {:has_more_values true
                        :values          [[2] [3] [4]]}
                       (custom-values/values-from-card
                        (t2/select-one Card :id card-id)
                        (mt/$ids $venues.category_id)))))
              (testing "search with  the value, not remapped values"
                (is (= {:has_more_values false
                        :values          [[2]]}
                       (custom-values/values-from-card
                        (t2/select-one Card :id card-id)
                        (mt/$ids $venues.category_id)
                        2)))))))))))

(deftest ^:parallel with-native-card-test
  (doseq [model? [true false]]
    (testing (format "source card is a %s with native question" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (mt/with-temp
          [Card {card-id :id} (merge (mt/card-with-source-metadata-for-query
                                      (mt/native-query {:query "select * from venues where lower(name) like '%red%'"}))
                                     {:database_id     (mt/id)
                                      :type            (if model? :model :question)
                                      :table_id        (mt/id :venues)})]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Fred 62"] ["Red Medicine"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    [:field "NAME" {:base-type :type/Text}]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Red Medicine"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    [:field "NAME" {:base-type :type/Text}]
                    "medicine")))))))))

(deftest ^:parallel deduplicate-and-remove-non-empty-values-empty
  (mt/dataset test-data
    (testing "the values list should not contains duplicated and empty values"
      (testing "with native query"
        (mt/with-temp [Card {card-id :id} (mt/card-with-source-metadata-for-query
                                           (mt/native-query {:query "select * from people"}))]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Affiliate"] ["Facebook"] ["Google"] ["Organic"] ["Twitter"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    [:field "SOURCE" {:base-type :type/Text}]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Facebook"] ["Google"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    [:field "SOURCE" {:base-type :type/Text}]
                    "oo")))))))))

(deftest ^:parallel deduplicate-and-remove-non-empty-values-empty-2
  (mt/dataset test-data
    (testing "the values list should not contains duplicated and empty values"
      (testing "with mbql query"
        (mt/with-temp [Card {card-id :id} (mt/card-with-source-metadata-for-query
                                           (mt/mbql-query people))]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Affiliate"] ["Facebook"] ["Google"] ["Organic"] ["Twitter"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    (mt/$ids $people.source)))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Facebook"] ["Google"]]}
                   (custom-values/values-from-card
                    (t2/select-one Card :id card-id)
                    (mt/$ids $people.source)
                    "oo")))))))))

(deftest errors-test
  (testing "error if doesn't have permissions"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp
          [Collection coll {}
           Card       card {:collection_id (:id coll)}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You don't have permissions to do that."
               (custom-values/parameter->values
                {:name                 "Card as source"
                 :slug                 "card"
                 :id                   "_CARD_"
                 :type                 "category"
                 :values_source_type   "card"
                 :values_source_config {:card_id     (:id card)
                                        :value_field (mt/$ids $venues.name)}}
                nil
                (fn [] (throw (ex-info "Shouldn't call this function" {})))))))))))

(deftest ^:parallel errors-test-2
  ;; bind to an admin to bypass the permissions check
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "call to default-case-fn if "
      (testing "souce card is archived"
        (t2.with-temp/with-temp [Card card {:archived true}]
          (let [mock-default-result {:has_more_values false
                                     :values [["archived"]]}]
            (is (= mock-default-result
                   (custom-values/parameter->values
                    {:name                 "Card as source"
                     :slug                 "card"
                     :id                   "_CARD_"
                     :type                 "category"
                     :values_source_type   "card"
                     :values_source_config {:card_id     (:id card)
                                            :value_field (mt/$ids $venues.name)}}
                    nil
                    (constantly mock-default-result))))))))))

(deftest ^:parallel errors-test-3
  ;; bind to an admin to bypass the permissions check
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "call to default-case-fn if "
      (testing "value-field not found in card's result_metadata"
        (t2.with-temp/with-temp [Card card {}]
          (let [mock-default-result {:has_more_values false
                                     :values [["field-not-found"]]}]
            (is (= mock-default-result
                   (custom-values/parameter->values
                    {:name                 "Card as source"
                     :slug                 "card"
                     :id                   "_CARD_"
                     :type                 "category"
                     :values_source_type   "card"
                     :values_source_config {:card_id     (:id card)
                                            :value_field [:field 0 nil]}}
                    nil
                    (constantly mock-default-result))))))))))

(deftest ^:parallel order-by-aggregation-fields-test
  (testing "Values could be retrieved for queries containing ordering by aggregation (#46369)"
    (doseq [model? [true false]]
      (testing (format "source card is a %s" (if model? "model" "question"))
        (mt/with-temp
          [Card {card-id :id} (merge (-> (mt/mbql-query
                                          products
                                          {:aggregation [[:count]]
                                           :breakout    [$category !month.created_at]
                                           :order-by    [[:asc [:aggregation 0]]]})
                                         mt/card-with-source-metadata-for-query)
                                     {:database_id     (mt/id)
                                      :type            (if model? :model :question)
                                      :table_id        (mt/id :products)})]
          (is (= {:has_more_values false
                  :values          [["Doohickey"] ["Gadget"] ["Gizmo"] ["Widget"]]}
                 (custom-values/values-from-card
                  (t2/select-one Card :id card-id)
                  (mt/$ids $products.category)))))))))
