(ns metabase.parameters.custom-values-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.parameters.custom-values-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :row-lock))

;;; --------------------------------------------- source=card ----------------------------------------------

(deftest ^:parallel with-mbql-card-test
  (doseq [model? [true false]]
    (testing (format "source card is a %s" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (testing "with simple mbql"
          (mt/with-temp
            [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                     {:database_id     (mt/id)
                                      :type            (if model? :model :question)
                                      :table_id        (mt/id :venues)})]
            (testing "get values"
              (is (= {:has_more_values true
                      :values          [["20th Century Cafe"] ["25°"] ["33 Taps"]]}
                     (custom-values/values-from-card
                      card
                      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :name)]))))
            (testing "case in-sensitve search test"
              (is (= {:has_more_values false
                      :values          [["Liguria Bakery"] ["Noe Valley Bakery"]]}
                     (custom-values/values-from-card
                      card
                      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :name)]
                      {:query-string "bakery"}))))))))))

(deftest ^:parallel with-label-field-test
  (testing "providing a label-field adds a second breakout so each row is a [value label] pair"
    (binding [custom-values/*max-rows* 3]
      (mt/with-temp
        [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                 {:database_id (mt/id)
                                  :type        :question
                                  :table_id    (mt/id :venues)})]
        (is (= {:has_more_values true
                :values          [[1 "Red Medicine"]
                                  [2 "Stout Burgers & Beers"]
                                  [3 "The Apple Pan"]]}
               (custom-values/values-from-card
                card
                [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :id)]
                {:label-field [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} (mt/id :venues :name)]})))))))

(deftest ^:parallel search-by-label-field-test
  (testing "query-string with a label-field filters by the label, not the value"
    (mt/with-temp
      [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                               {:database_id (mt/id)
                                :type        :question
                                :table_id    (mt/id :venues)})]
      (let [{:keys [values]} (custom-values/values-from-card
                              card
                              [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :id)]
                              {:query-string "bakery"
                               :label-field  [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"}
                                              (mt/id :venues :name)]})]
        (is (seq values))
        (is (every? (fn [[_id label]] (re-find #"(?i)bakery" label)) values))))))

(deftest ^:parallel with-mbql-card-test-2
  (testing "source card is a model" ; Models are opaque, so this sees the post-aggregation columns.
    (binding [custom-values/*max-rows* 3]
      (testing "has aggregation column"
        (mt/with-temp
          [:model/Card card (merge (mt/card-with-source-metadata-for-query
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
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "NAME"]))))
          (testing "get values from aggregation column"
            (is (= {:has_more_values true
                    :values          [[1] [2] [3]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Float, :lib/uuid "00000000-0000-0000-0000-000000000000"} "sum"]))))
          (testing "can search on aggregation column"
            (is (= {:has_more_values false
                    :values          [[2]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Float, :lib/uuid "00000000-0000-0000-0000-000000000000"} "sum"]
                    {:query-string 2}))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Bakery"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "NAME"]
                    {:query-string "bakery"})))))))))

(deftest ^:parallel with-mbql-card-test-2b
  (testing "source card is a question" ; Questions are transparent, so this can drop the aggregations and filter the original.
    (binding [custom-values/*max-rows* 3]
      (testing "has aggregation column"
        (mt/with-temp
          [:model/Card card (merge (mt/card-with-source-metadata-for-query
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
                    card
                    [:field {:source-field (mt/id :venues :category_id), :lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :categories :name)]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Bakery"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:source-field (mt/id :venues :category_id), :lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :categories :name)]
                    {:query-string "bakery"})))))))))

(deftest ^:parallel with-mbql-card-test-3
  (doseq [model? [true false]]
    (testing (format "source card is a %s" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (testing "should disable remapping when getting fk columns"
          (mt/with-column-remappings [venues.category_id categories.name]
            (mt/with-temp
              [:model/Card card (merge (mt/card-with-source-metadata-for-query
                                        (mt/mbql-query venues
                                          {:joins [{:source-table $$categories
                                                    :alias        "Categories"
                                                    :condition    [:= $venues.category_id &Categories.categories.id]}]}))
                                       {:type (if model? :model :question)})]
              (testing "get values returns the value, not remapped values"
                (is (= {:has_more_values true
                        :values          [[2] [3] [4]]}
                       (custom-values/values-from-card
                        card
                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :category_id)]))))
              (testing "search with  the value, not remapped values"
                (is (= {:has_more_values false
                        :values          [[2]]}
                       (custom-values/values-from-card
                        card
                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :category_id)]
                        {:query-string 2})))))))))))

(deftest ^:parallel with-mbql-card-test-4-explicit-fields
  (testing "source card with explicit :fields and no aggregations or breakouts"
    (binding [custom-values/*max-rows* 3]
      (mt/with-temp
        [:model/Card card (mt/card-with-source-metadata-for-query
                           (mt/mbql-query venues
                             {:fields [$id $latitude $longitude $name]
                              :filter [:= $category_id 2]}))]
        (testing "get values ignores the existing fields list"
          (is (= {:has_more_values true
                  :values          [["Chez Jay"] ["Marlowe"] ["Musso & Frank Grill"]]}
                 (custom-values/values-from-card
                  card
                  [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :name)]))))))))

(deftest ^:parallel with-mbql-card-test-5-explicit-fields-in-join
  (testing "source card with explicit :fields on a join, and no aggregations or breakouts"
    (binding [custom-values/*max-rows* 3]
      (mt/with-temp
        [:model/Card card (mt/card-with-source-metadata-for-query
                           (mt/mbql-query venues
                             {:fields [$id $latitude $longitude $name]
                              :joins [{:source-table $$categories
                                       :alias        "Cat"
                                       :fields       [&Cat.$categories.name]
                                       :condition    [:= $category_id &Cat.$categories.id]}]
                              :filter [:= $category_id 2]}))]
        (testing "get values ignores the existing fields list"
          (is (= {:has_more_values true
                  :values          [["Chez Jay"] ["Marlowe"] ["Musso & Frank Grill"]]}
                 (custom-values/values-from-card
                  card
                  [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :venues :name)]))))))))

(deftest ^:parallel with-filter-stage-test
  (binding [custom-values/*max-rows* 3]
    (testing "should nest the query if the target stage is after the last stage"
      (mt/with-column-remappings [venues.category_id categories.name]
        (mt/with-temp
          [:model/Card card (merge (mt/card-with-source-metadata-for-query
                                    (mt/mbql-query venues
                                      {:joins [{:source-table $$categories
                                                :alias        "Categories"
                                                :fields       :all
                                                :condition    [:= $venues.category_id &Categories.categories.id]}]}))
                                   {:type :question})]
          (is (= {:values [["American"] ["Artisan"] ["Asian"]]
                  :has_more_values true}
                 (custom-values/values-from-card
                  card
                  [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "Categories__NAME"]
                  {:stage-number 1}))))))))

(deftest ^:parallel with-mbql-card-test-6-expressions
  (binding [custom-values/*max-rows* 3]
    (testing "source card with expressions (#44703)"
      (mt/with-temp
        [:model/Card card (merge (mt/card-with-source-metadata-for-query
                                  (mt/mbql-query orders
                                    {:expressions {"unit price" [:/ $subtotal $quantity]}}))
                                 {:type :question})]
        (is (= {:values [[0.37796296296296295] [0.4318840579710145] [0.4328813559322034]]
                :has_more_values true}
               (custom-values/values-from-card
                card
                [:expression {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} "unit price"]
                {:stage-number 0})))))))

(deftest ^:parallel with-mbql-card-test-7-dangling-value-field
  (binding [custom-values/*max-rows* 3]
    (testing ":value_field references MBQL model which no longer returns that column, but has outdated :field_ref that matches it (#71164)"
      (mt/with-temp
        [:model/Card card (-> (mt/card-with-source-metadata-for-query
                               (mt/mbql-query people))
                              (assoc :type :question)
                              (assoc-in [:result_metadata 3 :field_ref] [:field 99999 nil]))]
        (is (= {:values          []
                :has_more_values false}
               (custom-values/values-from-card
                card
                [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Text} 99999]
                {:stage-number 0})))))))

(deftest ^:parallel with-native-card-test
  (doseq [model? [true false]]
    (testing (format "source card is a %s with native question" (if model? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (mt/with-temp
          [:model/Card card (merge (mt/card-with-source-metadata-for-query
                                    (mt/native-query {:query "select * from venues where lower(name) like '%red%'"}))
                                   {:database_id     (mt/id)
                                    :type            (if model? :model :question)
                                    :table_id        (mt/id :venues)})]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Fred 62"] ["Red Medicine"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "NAME"]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Red Medicine"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "NAME"]
                    {:query-string "medicine"})))))))))

(deftest ^:parallel deduplicate-and-remove-non-empty-values-empty
  (mt/dataset test-data
    (testing "the values list should not contains duplicated and empty values"
      (testing "with native query"
        (mt/with-temp [:model/Card card (mt/card-with-source-metadata-for-query
                                         (mt/native-query {:query "select * from people"}))]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Affiliate"] ["Facebook"] ["Google"] ["Organic"] ["Twitter"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "SOURCE"]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Facebook"] ["Google"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:base-type :type/Text, :lib/uuid "00000000-0000-0000-0000-000000000000"} "SOURCE"]
                    {:query-string "oo"})))))))))

(deftest ^:parallel deduplicate-and-remove-non-empty-values-empty-2
  (mt/dataset test-data
    (testing "the values list should not contains duplicated and empty values"
      (testing "with mbql query"
        (mt/with-temp [:model/Card card (mt/card-with-source-metadata-for-query
                                         (mt/mbql-query people))]
          (testing "get values from breakout columns"
            (is (= {:has_more_values false
                    :values          [["Affiliate"] ["Facebook"] ["Google"] ["Organic"] ["Twitter"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :people :source)]))))
          (testing "doing case in-sensitve search on breakout columns"
            (is (= {:has_more_values false
                    :values          [["Facebook"] ["Google"]]}
                   (custom-values/values-from-card
                    card
                    [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :people :source)]
                    {:query-string "oo"})))))))))

(deftest errors-test
  (testing "error if doesn't have permissions"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp
          [:model/Collection coll {}
           :model/Card       card {:collection_id (:id coll)}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You don't have permissions to do that."
               (custom-values/parameter->values
                {:name                 "Card as source"
                 :slug                 "card"
                 :id                   "_CARD_"
                 :type                 :category
                 :values_source_type   :card
                 :values_source_config {:card_id     (:id card)
                                        :value_field (mt/$ids $venues.name)}}
                nil
                (fn [] (throw (ex-info "Shouldn't call this function" {})))))))))))

(deftest ^:parallel errors-test-2
  ;; bind to an admin to bypass the permissions check
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "call to default-case-fn if "
      (testing "souce card is archived"
        (mt/with-temp [:model/Card card {:archived true}]
          (let [mock-default-result {:has_more_values false
                                     :values [["archived"]]}]
            (is (= mock-default-result
                   (custom-values/parameter->values
                    {:name                 "Card as source"
                     :slug                 "card"
                     :id                   "_CARD_"
                     :type                 :category
                     :values_source_type   :card
                     :values_source_config {:card_id     (:id card)
                                            :value_field (mt/$ids $venues.name)}}
                    nil
                    (constantly mock-default-result))))))))))

(deftest ^:parallel errors-test-3
  ;; bind to an admin to bypass the permissions check
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "call to default-case-fn if "
      (testing "value-field not found in card's result_metadata"
        (mt/with-temp [:model/Card card {}]
          (let [mock-default-result {:has_more_values false
                                     :values [["field-not-found"]]}]
            (is (= mock-default-result
                   (custom-values/parameter->values
                    {:name                 "Card as source"
                     :slug                 "card"
                     :id                   "_CARD_"
                     :type                 :category
                     :values_source_type   :card
                     :values_source_config {:card_id     (:id card)
                                            :value_field [:field Integer/MAX_VALUE nil]}}
                    nil
                    (constantly mock-default-result))))))))))

(deftest ^:parallel parameter->values-join-aliased-value-field-test
  (let [mp (mt/metadata-provider)
        venue-table (lib.metadata/table mp (mt/id :venues))
        categories-table (lib.metadata/table mp (mt/id :categories))
        venue-category-id (lib.metadata/field mp (mt/id :venues :category_id))
        category-id (lib.metadata/field mp (mt/id :categories :id))
        query (-> (lib/query mp venue-table)
                  (lib/join (lib/join-clause categories-table
                                             [(lib/= venue-category-id category-id)])))]
    (binding [custom-values/*max-rows* 3]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id} (mt/card-with-source-metadata-for-query query)]
          (is (= {:has_more_values true
                  :values          [["American"] ["Artisan"] ["Asian"]]}
                 (custom-values/parameter->values
                  {:name                 "Category name"
                   :slug                 "category_name"
                   :id                   (str (random-uuid))
                   :type                 :string/=
                   :values_query_type    :list
                   :values_source_type   :card
                   :values_source_config {:card_id     card-id
                                          :value_field [:field "Categories__NAME" {:base-type :type/Text}]}}
                  nil
                  (fn [] (throw (ex-info "Couldn't get parameter values unexpectedly" {})))))))))))

(deftest ^:parallel parameter->values-with-label-field-test
  ;; bind to an admin to bypass the permissions check
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a card source with a label_field returns [value label] pairs through parameter->values"
      (binding [custom-values/*max-rows* 3]
        (mt/with-temp
          [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                   {:database_id (mt/id)
                                    :type        :question
                                    :table_id    (mt/id :venues)})]
          (is (= {:has_more_values true
                  :values          [[1 "Red Medicine"]
                                    [2 "Stout Burgers & Beers"]
                                    [3 "The Apple Pan"]]}
                 (custom-values/parameter->values
                  {:name                 "Card as source"
                   :slug                 "card"
                   :id                   "_CARD_"
                   :type                 :category
                   :values_source_type   :card
                   :values_source_config {:card_id     (:id card)
                                          :value_field (mt/$ids $venues.id)
                                          :label_field (mt/$ids $venues.name)}}
                  nil
                  (fn [] (throw (ex-info "Shouldn't call this function" {})))))))))))

(deftest ^:parallel parameter-remapped-value-card-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a card source with a label_field remaps a single value to a [value label] pair"
      (mt/with-temp
        [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                 {:database_id (mt/id)
                                  :type        :question
                                  :table_id    (mt/id :venues)})]
        (is (= [1 "Red Medicine"]
               (custom-values/parameter-remapped-value
                {:name                 "Card as source"
                 :slug                 "card"
                 :id                   "_CARD_"
                 :type                 :category
                 :values_source_type   :card
                 :values_source_config {:card_id     (:id card)
                                        :value_field (mt/$ids $venues.id)
                                        :label_field (mt/$ids $venues.name)}}
                1
                (fn [] (throw (ex-info "Shouldn't call this function" {}))))))))
    (testing "a card source without a label_field has no remapped value"
      (mt/with-temp
        [:model/Card card (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                 {:database_id (mt/id)
                                  :type        :question
                                  :table_id    (mt/id :venues)})]
        (is (nil? (custom-values/parameter-remapped-value
                   {:name                 "Card as source"
                    :slug                 "card"
                    :id                   "_CARD_"
                    :type                 :category
                    :values_source_type   :card
                    :values_source_config {:card_id     (:id card)
                                           :value_field (mt/$ids $venues.id)}}
                   1
                   (fn [] (throw (ex-info "Shouldn't call this function" {}))))))))))

(deftest ^:parallel values-from-card-external-remapping-test
  (testing "remapped breakouts are stripped from the result, leaving only the requested columns in the requested order"
    (mt/dataset test-data
      (mt/with-column-remappings [orders.user_id    people.name
                                  orders.product_id products.title]
        (binding [custom-values/*max-rows* 3]
          (mt/with-temp
            [:model/Card card (mt/card-with-source-metadata-for-query (mt/mbql-query orders))]
            (let [user-id-ref       (lib/ensure-uuid [:field {} (mt/id :orders :user_id)])
                  people-name-ref   (lib/ensure-uuid [:field {} (mt/id :people :name)])
                  product-title-ref (lib/ensure-uuid [:field {} (mt/id :products :title)])]
              (testing "value-field is a remapped FK with no label"
                (is (= {:has_more_values true
                        :values          [[2210] [624] [276]]}
                       (custom-values/values-from-card card user-id-ref))))
              (testing "value-field is a remapped FK, label-field is its remap target"
                (is (= {:has_more_values true
                        :values          [[2210 "Abbey Satterfield"]
                                          [624 "Abbie Parisian"]
                                          [276 "Abbie Ryan"]]}
                       (custom-values/values-from-card card user-id-ref {:label-field people-name-ref}))))
              (testing "value-field and label-field are remap targets reached via different FKs"
                (is (= {:has_more_values true
                        :values          [["Abbey Satterfield" "Aerodynamic Leather Toucan"]
                                          ["Abbey Satterfield" "Awesome Plastic Watch"]
                                          ["Abbey Satterfield" "Enormous Cotton Pants"]]}
                       (custom-values/values-from-card card people-name-ref {:label-field product-title-ref})))))))))))

(deftest ^:parallel parameter-remapped-value-external-remapping-test
  (testing "parameter-remapped-value returns the [value label] pair for a single value when breakouts are remapped"
    (mt/dataset test-data
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-column-remappings [orders.user_id    people.name
                                    orders.product_id products.title]
          (binding [custom-values/*max-rows* 3]
            (mt/with-temp
              [:model/Card card (mt/card-with-source-metadata-for-query (mt/mbql-query orders))]
              (let [raise (fn [] (throw (ex-info "Shouldn't call this function" {})))]
                (testing "value-field is a remapped FK, label-field is its remap target"
                  (is (= [2210 "Abbey Satterfield"]
                         (custom-values/parameter-remapped-value
                          {:name                 "Card as source"
                           :slug                 "card"
                           :id                   "_CARD_"
                           :type                 :category
                           :values_source_type   :card
                           :values_source_config {:card_id     (:id card)
                                                  :value_field (mt/$ids $orders.user_id)
                                                  :label_field (mt/$ids $people.name)}}
                          2210
                          raise))))
                (testing "value-field and label-field are remap targets reached via different FKs"
                  (is (= ["Abbey Satterfield" "Aerodynamic Leather Toucan"]
                         (custom-values/parameter-remapped-value
                          {:name                 "Card as source"
                           :slug                 "card"
                           :id                   "_CARD_"
                           :type                 :category
                           :values_source_type   :card
                           :values_source_config {:card_id     (:id card)
                                                  :value_field (mt/$ids $orders.user_id->people.name)
                                                  :label_field (mt/$ids $orders.product_id->products.title)}}
                          "Abbey Satterfield"
                          raise))))))))))))

(deftest ^:parallel order-by-aggregation-fields-test
  (testing "Values could be retrieved for queries containing ordering by aggregation (#46369)"
    (doseq [model? [true false]]
      (testing (format "source card is a %s" (if model? "model" "question"))
        (mt/with-temp
          [:model/Card card (merge (-> (mt/mbql-query
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
                  card
                  [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (mt/id :products :category)]))))))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test
  (testing "single group"
    (testing "with PK"
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :products :id)])))
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :reviews :product_id)
                                                   (mt/id :products :id)]))))
    (testing "without PK"
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)})))
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :reviews :product_id)]))))
    (testing "duplicates are OK "
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :orders :product_id)
                                                   (mt/id :reviews :product_id)
                                                   (mt/id :reviews :product_id)])))
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :orders :product_id)
                                                   (mt/id :orders :product_id)
                                                   (mt/id :reviews :product_id)])))
      (is (= (mt/id :products :id)
             (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                   (mt/id :orders :product_id)
                                                   (mt/id :orders :product_id)]))))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test-2
  (testing "two groups"
    (testing "both with PKs"
      (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                      (mt/id :reviews :product_id)
                                                      (mt/id :products :id)
                                                      (mt/id :orders :user_id)
                                                      (mt/id :people :id)]))))
    (testing "one with PK"
      (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                      (mt/id :reviews :product_id)
                                                      (mt/id :orders :user_id)
                                                      (mt/id :people :id)]))))
    (testing "none with PK"
      (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                      (mt/id :reviews :product_id)
                                                      (mt/id :orders :user_id)]))))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test-3
  (testing "single group with PK plus other field"
    (is (nil? (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)
                                                     (mt/id :reviews :product_id)
                                                     (mt/id :products :id)
                                                     (mt/id :people :name)})))
    (is (nil? (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)
                                                     (mt/id :reviews :product_id)
                                                     (mt/id :products :id)
                                                     Integer/MAX_VALUE})))
    (is (nil? (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)
                                                     (mt/id :reviews :product_id)
                                                     (mt/id :products :id)
                                                     -1})))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test-4
  (testing "single group without PK plus other field"
    (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :orders :product_id)
                                                    (mt/id :reviews :product_id)
                                                    (mt/id :people :name)])))
    (is (nil? (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)
                                                     (mt/id :reviews :product_id)
                                                     Integer/MAX_VALUE})))
    (is (nil? (custom-values/pk-of-fk-pk-field-ids #{(mt/id :orders :product_id)
                                                     (mt/id :reviews :product_id)
                                                     -1})))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test-5
  (testing "just a PK"
    (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :products :id)])))))

(deftest ^:parallel pk-of-fk-pk-field-ids-test-6
  (testing "just a non-key"
    (is (nil? (custom-values/pk-of-fk-pk-field-ids [(mt/id :people :name)])))))

(deftest ^:parallel card-query-bulk-loads-metadata-test
  (testing "card-query bulk-loads the value-source Card's metadata up front, so resolving the value field's column hits
            the provider cache instead of fetching one entity at a time (no N+1)"
    (let [mp           (mt/metadata-provider)
          orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Card card {:database_id     (mt/id)
                                       :table_id        (mt/id :orders)
                                       :type            :question
                                       :dataset_query   orders-query
                                       :result_metadata (lib/returned-columns orders-query)}]
        (let [card        (t2/select-one :model/Card :id (:id card))
              value-field [:field "TOTAL" {:base-type :type/Float}]]
          ;; The 6 batched loads are:
          ;; - the source Card
          ;; - the source Database
          ;; - the Card's result-metadata Fields
          ;; - those Fields' FK targets
          ;; - the FK-target Tables
          ;; - those Tables' columns
          ;; This count is constant -- it must NOT grow with the number of columns/Tables (that would be the N+1 this
          ;; bulk-loading exists to prevent).
          (is (= 6 (lib-be/with-metadata-provider-cache
                     (t2/with-call-count [call-count]
                       (#'custom-values/can-get-card-values? (#'custom-values/card-query (:id card) (:dataset_query card)) value-field)
                       (call-count))))))))))
