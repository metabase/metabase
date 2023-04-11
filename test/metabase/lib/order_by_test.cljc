(ns metabase.lib.order-by-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel order-by-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))))))

(deftest ^:parallel threading-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              (dissoc :lib/metadata)))))

(deftest ^:parallel threading-with-direction-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:desc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID") :desc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel specific-stage-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}
                       :order-by    [[:asc
                                      {:lib/uuid string?}
                                      [:field {:lib/uuid string?} (meta/id :venues :id)]]]}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}]}
          (-> (lib/query meta/metadata-provider {:database (meta/id)
                                                 :type     :query
                                                 :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
              (lib/order-by 1 (lib/field "VENUES" "ID") :asc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel order-by-field-metadata-test
  (testing "Should be able to create an order by using raw Field metadata"
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? [:asc
               {:lib/uuid string?}
               [:field {:lib/uuid string?} (meta/id :venues :id)]]
              (lib/order-by-clause query -1 (lib.metadata/field meta/metadata-provider nil "VENUES" "ID"))))
      (is (=? [:desc
               {:lib/uuid string?}
               [:field {:lib/uuid string?} (meta/id :venues :id)]]
              (lib/order-by-clause query -1 (lib.metadata/field meta/metadata-provider nil "VENUES" "ID") :desc))))))

(deftest ^:parallel append-order-by-field-metadata-test
  (testing "Should be able to add an order by using raw Field metadata"
    (let [query     (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
          venues-id (lib.metadata/field query (meta/id :venues :id))]
      (is (=? {:database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :categories)
                           :order-by     [[:asc
                                           {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
              (lib/order-by query venues-id))))))

(deftest ^:parallel order-bys-test
  (is (=? [[:asc
            {:lib/uuid string?}
            [:field {:lib/uuid string?} (meta/id :venues :id)]]]
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              lib/order-bys))))

;;; the following tests use raw legacy MBQL because they're direct ports of JavaScript tests from MLv1 and I wanted to
;;; make sure that given an existing query the expected description was generated correctly.

(defn- describe-legacy-query-order-by [query]
  (-> (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))
      (lib.metadata.calculation/describe-top-level-key -1 :order-by)))

(deftest ^:parallel describe-order-by-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :order-by     [[:asc [:field (meta/id :venues :category-id) nil]]]}}]
    (is (= "Sorted by Category ID ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel describe-order-by-aggregation-reference-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:count]]
                          :breakout     [[:field (meta/id :venues :category-id) nil]]
                          :order-by     [[:asc [:aggregation 0]]]}}]
    (is (= "Sorted by Count ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel orderable-columns-breakouts-test
  (testing "If query has aggregations and/or breakouts you can only order by those."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field "VENUES" "PRICE")))
                    (lib/aggregate (lib/avg (lib/+ (lib/field "VENUES" "PRICE") 1)))
                    (lib/breakout (lib/field "VENUES" "CATEGORY_ID")))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:database_type      "INTEGER"
                  :semantic_type      :type/FK
                  :lib/type           :metadata/field
                  :table_id           (meta/id :venues)
                  :name               "CATEGORY_ID"
                  :has_field_values   :none
                  :lib/source         :source/breakouts
                  :fk_target_field_id (meta/id :categories :id)
                  :effective_type     :type/Integer
                  :id                 (meta/id :venues :category-id)
                  :display_name       "Category ID"
                  :base_type          :type/Integer}
                 {:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "sum_PRICE"
                  :display_name "Sum of Price"
                  :lib/source   :source/aggregations}
                 {:lib/type     :metadata/field
                  :base_type    :type/Float
                  :name         "avg_PRICE_plus_1"
                  :display_name "Average of Price + 1"
                  :lib/source   :source/aggregations}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-breakouts-with-expression-test
  (testing "If query has aggregations and/or breakouts you can only order by those (with an expression)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1))
                    (lib/breakout [:expression {:lib/uuid (str (random-uuid))} "Category ID + 1"]))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:lib/type     :metadata/field
                  :name         "Category ID + 1"
                  :display_name "Category ID + 1"
                  :base_type    :type/Integer
                  :lib/source   :source/breakouts}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
    (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
      (is (=? [{:lib/type                 :metadata/field
                :name                     "ID"
                :display_name             "ID"
                :id                       (meta/id :venues :id)
                :table_id                 (meta/id :venues)
                :base_type                :type/BigInteger
                :lib/source-column-alias  "ID"
                :lib/desired-column-alias "ID"}
               {:lib/type                 :metadata/field
                :name                     "NAME"
                :display_name             "Name"
                :id                       (meta/id :venues :name)
                :table_id                 (meta/id :venues)
                :base_type                :type/Text
                :lib/source-column-alias  "NAME"
                :lib/desired-column-alias "NAME"}
               {:lib/type                 :metadata/field
                :name                     "CATEGORY_ID"
                :display_name             "Category ID"
                :id                       (meta/id :venues :category-id)
                :table_id                 (meta/id :venues)
                :lib/source-column-alias  "CATEGORY_ID"
                :lib/desired-column-alias "CATEGORY_ID"}
               {:lib/type                 :metadata/field
                :name                     "LATITUDE"
                :display_name             "Latitude"
                :id                       (meta/id :venues :latitude)
                :table_id                 (meta/id :venues)
                :base_type                :type/Float
                :lib/source-column-alias  "LATITUDE"
                :lib/desired-column-alias "LATITUDE"}
               {:lib/type                 :metadata/field
                :name                     "LONGITUDE"
                :display_name             "Longitude"
                :id                       (meta/id :venues :longitude)
                :table_id                 (meta/id :venues)
                :base_type                :type/Float
                :lib/source-column-alias  "LONGITUDE"
                :lib/desired-column-alias "LONGITUDE"}
               {:lib/type                 :metadata/field
                :name                     "PRICE"
                :display_name             "Price"
                :id                       (meta/id :venues :price)
                :table_id                 (meta/id :venues)
                :base_type                :type/Integer
                :lib/source-column-alias  "PRICE"
                :lib/desired-column-alias "PRICE"}
               {:lib/type                 :metadata/field
                :name                     "ID"
                :display_name             "ID"
                :id                       (meta/id :categories :id)
                :table_id                 (meta/id :categories)
                :base_type                :type/BigInteger
                :lib/source-column-alias  "ID"
                :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__ID"}
               {:lib/type                 :metadata/field
                :name                     "NAME"
                :display_name             "Name"
                :id                       (meta/id :categories :name)
                :table_id                 (meta/id :categories)
                :base_type                :type/Text
                :lib/source-column-alias  "NAME"
                :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__NAME"}]
              (lib/orderable-columns query))))))

(deftest ^:parallel orderable-expressions-test
  (testing "orderable-columns should include expressions"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1)))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "Category ID + 1"
                  :display_name "Category ID + 1"
                  :lib/source   :source/expressions}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-expressions-exclude-boolean-expressions-test
  (testing "orderable-columns should filter out boolean expressions."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Name is empty?"  (lib/is-empty (lib/field "VENUES" "NAME"))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-explicit-joins-test
  (testing "orderable-columns should include columns from explicit joins"
    (let [query (lib.tu/query-with-join)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/field
                  :name         "ID"
                  :display_name "Categories → ID" ; should we be using the explicit alias we gave this join?
                  :source_alias "Cat"
                  :id           (meta/id :categories :id)
                  :table_id     (meta/id :categories)
                  :base_type    :type/BigInteger}
                 {:lib/type     :metadata/field
                  :name         "NAME"
                  :display_name "Categories → Name"
                  :source_alias "Cat"
                  :id           (meta/id :categories :name)
                  :table_id     (meta/id :categories)
                  :base_type    :type/Text}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-source-metadata-test
  (testing "orderable-columns should use metadata for source query."
    (let [query (lib.tu/query-with-card-source-table)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:name      "ID"
                  :base_type :type/BigInteger}
                 {:name      "NAME"
                  :base_type :type/Text}
                 {:name      "CATEGORY_ID"
                  :base_type :type/Integer}
                 {:name      "LATITUDE"
                  :base_type :type/Float}
                 {:name      "LONGITUDE"
                  :base_type :type/Float}
                 {:name      "PRICE"
                  :base_type :type/Integer}]
                (lib/orderable-columns query)))
        (testing `lib/display-info
          (is (=? [{:name "ID",          :table {:name "My Card", :display_name "My Card"}}
                   {:name "NAME",        :table {:name "My Card", :display_name "My Card"}}
                   {:name "CATEGORY_ID", :table {:name "My Card", :display_name "My Card"}}
                   {:name "LATITUDE",    :table {:name "My Card", :display_name "My Card"}}
                   {:name "LONGITUDE",   :table {:name "My Card", :display_name "My Card"}}
                   {:name "PRICE",       :table {:name "My Card", :display_name "My Card"}}]
                  (for [col (lib/orderable-columns query)]
                    (lib/display-info query col)))))))))

(deftest ^:parallel orderable-columns-e2e-test
  (testing "Use the metadata returned by `orderable-columns` to add a new order-by to a query."
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :venues)
                           :lib/options  {:lib/uuid string?}}]}
              query))
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [orderable-columns (lib/orderable-columns query)
              col               (m/find-first #(= (:id %) (meta/id :venues :name)) orderable-columns)
              query'            (lib/order-by query col)]
          (is (=? {:lib/type :mbql/query
                   :database (meta/id)
                   :stages   [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
                               :lib/options  {:lib/uuid string?}
                               :order-by     [[:asc
                                               {:lib/uuid string?}
                                               [:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]]}]}
                  query'))
          (is (=? [[:asc
                    {:lib/uuid string?}
                    [:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]]
                  (lib/order-bys query'))))))))

(deftest ^:parallel orderable-columns-with-source-card-e2e-test
  (testing "Make sure you can order by a column that comes from a source Card (Saved Question/Model/etc)"
    (let [query (lib.tu/query-with-card-source-table)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [name-col (m/find-first #(= (:name %) "NAME")
                                     (lib/orderable-columns query))]
          (is (=? {:name      "NAME"
                   :base_type :type/Text}
                  name-col))
          (let [query' (lib/order-by query name-col)]
            (is (=? {:stages
                     [{:source-table "card__1"
                       :order-by [[:asc
                                   {}
                                   [:field {:base-type :type/Text} "NAME"]]]}]}
                    query'))
            (is (= "My Card, Sorted by Name ascending"
                   (lib/describe-query query')))
            (is (= ["Name ascending"]
                   (for [order-by (lib/order-bys query')]
                     (lib/display-name query' order-by))))))))))

(deftest ^:parallel orderable-columns-with-join-test
  (is (=? [{:name                     "ID"
            :lib/source-column-alias  "ID"
            :lib/desired-column-alias "ID"
            :lib/source               :source/table-defaults}
           {:name                     "NAME"
            :lib/source-column-alias  "NAME"
            :lib/desired-column-alias "NAME"
            :lib/source               :source/table-defaults}
           {:name                     "CATEGORY_ID"
            :lib/source-column-alias  "CATEGORY_ID"
            :lib/desired-column-alias "CATEGORY_ID"
            :lib/source               :source/table-defaults}
           {:name                     "LATITUDE"
            :lib/source-column-alias  "LATITUDE"
            :lib/desired-column-alias "LATITUDE"
            :lib/source               :source/table-defaults}
           {:name                     "LONGITUDE"
            :lib/source-column-alias  "LONGITUDE"
            :lib/desired-column-alias "LONGITUDE"
            :lib/source               :source/table-defaults}
           {:name                     "PRICE"
            :lib/source-column-alias  "PRICE"
            :lib/desired-column-alias "PRICE"
            :lib/source               :source/table-defaults}
           {:name                     "ID"
            :lib/source-column-alias  "ID"
            :lib/desired-column-alias "Cat__ID"
            :lib/source               :source/joins}
           {:name                     "NAME"
            :lib/source-column-alias  "NAME"
            :lib/desired-column-alias "Cat__NAME"
            :lib/source               :source/joins}]
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/join (-> (lib/join-clause
                             (meta/table-metadata :categories)
                             [(lib/=
                                (lib/field "VENUES" "CATEGORY_ID")
                                (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                            (lib/with-join-alias "Cat")
                            (lib/with-join-fields :all)))
              (lib/fields [(lib/field "VENUES" "ID")
                           (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat")])
              (lib/orderable-columns)))))

(deftest ^:parallel order-bys-with-duplicate-column-names-test
  (testing "Order by stuff should work with two different columns named ID (#29702)"
    (is (=? [{:id                       (meta/id :venues :id)
              :name                     "ID"
              :lib/source               :source/previous-stage
              :lib/type                 :metadata/field
              :base_type                :type/BigInteger
              :effective_type           :type/BigInteger
              :display_name             "ID"
              :table_id                 (meta/id :venues)
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"}
             {:id                       (meta/id :categories :id)
              :name                     "ID"
              :lib/source               :source/previous-stage
              :lib/type                 :metadata/field
              :base_type                :type/BigInteger
              :effective_type           :type/BigInteger
              :display_name             "Categories → ID"
              :table_id                 (meta/id :categories)
              :lib/source-column-alias  "Cat__ID"
              :lib/desired-column-alias "Cat__ID"}]
            (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                (lib/join (-> (lib/join-clause
                                (meta/table-metadata :categories)
                                [(lib/=
                                   (lib/field "VENUES" "CATEGORY_ID")
                                   (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                              (lib/with-join-alias "Cat")
                              (lib/with-join-fields :all)))
                (lib/fields [(lib/field "VENUES" "ID")
                             (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat")])
                (lib/append-stage)
                (lib/orderable-columns))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-columns-test
  (testing "orderable-columns should not return normal Fields already included in :order-by (#29807)"
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? [{:display_name "ID",          :lib/source :source/table-defaults}
               {:display_name "Name",        :lib/source :source/table-defaults}
               {:display_name "Category ID", :lib/source :source/table-defaults}
               {:display_name "Latitude",    :lib/source :source/table-defaults}
               {:display_name "Longitude",   :lib/source :source/table-defaults}
               {:display_name "Price",       :lib/source :source/table-defaults}
               {:display_name "ID",          :lib/source :source/implicitly-joinable}
               {:display_name "Name",        :lib/source :source/implicitly-joinable}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (second (lib/orderable-columns query)))]
        (is (=? {:stages [{:order-by [[:asc {} [:field {} (meta/id :venues :name)]]]}]}
                query'))
        (is (=? [[:asc {} [:field {} (meta/id :venues :name)]]]
                (lib/order-bys query')))
        (is (=? [{:display_name "ID",          :lib/source :source/table-defaults}
                 {:display_name "Category ID", :lib/source :source/table-defaults}
                 {:display_name "Latitude",    :lib/source :source/table-defaults}
                 {:display_name "Longitude",   :lib/source :source/table-defaults}
                 {:display_name "Price",       :lib/source :source/table-defaults}
                 {:display_name "ID",          :lib/source :source/implicitly-joinable}
                 {:display_name "Name",        :lib/source :source/implicitly-joinable}]
                (lib/orderable-columns query')))
        (testing "Introduce a new stage"
          (let [query'' (lib/append-stage query')]
            (is (=? [{:display_name "ID",          :lib/source :source/previous-stage}
                     {:display_name "Name",        :lib/source :source/previous-stage}
                     {:display_name "Category ID", :lib/source :source/previous-stage}
                     {:display_name "Latitude",    :lib/source :source/previous-stage}
                     {:display_name "Longitude",   :lib/source :source/previous-stage}
                     {:display_name "Price",       :lib/source :source/previous-stage}
                     {:display_name "ID",          :lib/source :source/implicitly-joinable}
                     {:display_name "Name",        :lib/source :source/implicitly-joinable}]
                    (lib/orderable-columns query'')))))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-aggregation-test
  (testing "orderable-columns should not return aggregation refs that are already in :order-by (#29807)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field (meta/id :venues :price))))
                    (lib/aggregate (lib/sum (lib/field (meta/id :venues :id)))))]
      (is (=? [{:display_name "Sum of Price", :lib/source :source/aggregations}
               {:display_name "Sum of ID",    :lib/source :source/aggregations}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (first (lib/orderable-columns query)))]
        (is (=? [{:display_name "Sum of ID", :lib/source :source/aggregations}]
                (lib/orderable-columns query')))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-joined-columns-test
  (testing "orderable-columns should not return joined columns that are already in :order-by (#29807)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/join (-> (lib/table (meta/id :categories))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))
                              [(lib/= (lib/field (meta/id :venues :category-id))
                                      (-> (lib/field (meta/id :categories :id))
                                          (lib/with-join-alias "Cat")))]))]
      (is (=? {:stages [{:joins
                         [{:stages     [{}]
                           :alias      "Cat"
                           :fields     :all
                           :conditions [[:=
                                         {}
                                         [:field {} (meta/id :venues :category-id)]
                                         [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}]}]}
              query))
      (is (=? [{:display_name "ID",                :lib/source :source/table-defaults}
               {:display_name "Name",              :lib/source :source/table-defaults}
               {:display_name "Category ID",       :lib/source :source/table-defaults}
               {:display_name "Latitude",          :lib/source :source/table-defaults}
               {:display_name "Longitude",         :lib/source :source/table-defaults}
               {:display_name "Price",             :lib/source :source/table-defaults}
               ;; implicitly joinable versions shouldn't be returned either, since we have an explicit join.
               {:display_name "Categories → ID",   :lib/source :source/joins}
               {:display_name "Categories → Name", :lib/source :source/joins}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (m/find-first #(= (:display_name %) "Categories → Name")
                                                     (lib/orderable-columns query)))]
        (is (=? [{:display_name "ID",                :lib/source :source/table-defaults}
                 {:display_name "Name",              :lib/source :source/table-defaults}
                 {:display_name "Category ID",       :lib/source :source/table-defaults}
                 {:display_name "Latitude",          :lib/source :source/table-defaults}
                 {:display_name "Longitude",         :lib/source :source/table-defaults}
                 {:display_name "Price",             :lib/source :source/table-defaults}
                 {:display_name "Categories → ID",   :lib/source :source/joins}]
                (lib/orderable-columns query')))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-implicitly-joinable-columns-test
  (testing "orderable-columns should not return implicitly joinable columns that are already in :order-by (#29807)"
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
          query (-> query
                    (lib/order-by (m/find-first #(= (:id %) (meta/id :categories :name))
                                   (lib/orderable-columns query))))]
      (is (=? {:stages [{:order-by [[:asc {} [:field
                                              {:source-field (meta/id :venues :category-id)}
                                              (meta/id :categories :name)]]]}]}
              query))
      (is (= "Venues, Sorted by Categories → Name ascending"
             (lib/describe-query query)))
      (is (=? [{:display_name "ID",          :lib/source :source/table-defaults}
               {:display_name "Name",        :lib/source :source/table-defaults}
               {:display_name "Category ID", :lib/source :source/table-defaults}
               {:display_name "Latitude",    :lib/source :source/table-defaults}
               {:display_name "Longitude",   :lib/source :source/table-defaults}
               {:display_name "Price",       :lib/source :source/table-defaults}
               {:display_name "ID",          :lib/source :source/implicitly-joinable}]
              (lib/orderable-columns query))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-expression-test
  (testing "orderable-columns should not return expressions that are already in :order-by (#29807)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "My Expression" (lib/+ 2 3)))]
      (is (=? [{:display_name "ID",            :lib/source :source/table-defaults}
               {:display_name "Name",          :lib/source :source/table-defaults}
               {:display_name "Category ID",   :lib/source :source/table-defaults}
               {:display_name "Latitude",      :lib/source :source/table-defaults}
               {:display_name "Longitude",     :lib/source :source/table-defaults}
               {:display_name "Price",         :lib/source :source/table-defaults}
               {:display_name "My Expression", :lib/source :source/expressions}
               {:display_name "ID",            :lib/source :source/implicitly-joinable}
               {:display_name "Name",          :lib/source :source/implicitly-joinable}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (m/find-first #(= (:display_name %) "My Expression")
                                                     (lib/orderable-columns query)))]
        (is (=? [{:display_name "ID",            :lib/source :source/table-defaults}
                 {:display_name "Name",          :lib/source :source/table-defaults}
                 {:display_name "Category ID",   :lib/source :source/table-defaults}
                 {:display_name "Latitude",      :lib/source :source/table-defaults}
                 {:display_name "Longitude",     :lib/source :source/table-defaults}
                 {:display_name "Price",         :lib/source :source/table-defaults}
                 {:display_name "ID",            :lib/source :source/implicitly-joinable}
                 {:display_name "Name",          :lib/source :source/implicitly-joinable}]
                (lib/orderable-columns query')))))))

(deftest ^:parallel order-by-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                  (lib/fields [(lib/field "VENUES" "ID")]))]
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :display_name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :display_name "Name",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :display_name "Category ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :display_name "Latitude",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :display_name "Longitude",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :display_name "Price",       :lib/source :source/table-defaults}
             {:name "expr", :display_name "expr", :lib/source :source/expressions}
             {:id (meta/id :categories :id),   :name "ID",   :display_name "ID",   :lib/source :source/implicitly-joinable}
             {:id (meta/id :categories :name), :name "NAME", :display_name "Name", :lib/source :source/implicitly-joinable}]
            (lib/orderable-columns query)))
    (let [expr (m/find-first #(= (:name %) "expr") (lib/orderable-columns query))]
      (is (=? {:lib/type   :metadata/field
               :lib/source :source/expressions
               :name       "expr"}
              expr))
      (let [updated-query (lib/order-by query expr)]
        (is (=? {:stages [{:order-by [[:asc {} [:expression {} "expr"]]]}]}
                updated-query))
        (testing "description"
          (is (= "Venues, Sorted by expr ascending"
                 (lib/describe-query updated-query))))))))

(deftest ^:parallel orderable-columns-display-info-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
    (is (=? [{:semantic_type          :type/PK
              :is_calculated          false
              :table                  {:name "VENUES", :display_name "Venues"}
              :name                   "ID"
              :is_from_previous_stage false
              :is_implicitly_joinable false
              :effective_type         :type/BigInteger
              :is_from_join           false
              :display_name           "ID"}
             {:display_name "Name"}
             {:display_name "Category ID"}
             {:display_name "Latitude"}
             {:display_name "Longitude"}
             {:display_name "Price"}
             {:display_name "ID"}
             {:display_name "Name"}]
            (for [col (lib/orderable-columns query)]
              (lib/display-info query col))))))

(deftest ^:parallel order-bys-display-info-test
  (let [query             (lib/query-for-table-name meta/metadata-provider "VENUES")
        orderable-columns (lib/orderable-columns query)
        col               (m/find-first #(= (:id %) (meta/id :venues :name)) orderable-columns)
        _                 (is (some? col))
        query'            (lib/order-by query col)]
    (is (=? [{:name           "NAME"
              :display_name   "Name"
              :semantic_type  :type/Name
              :effective_type :type/Text
              :table          {:name "VENUES", :display_name "Venues"}
              :direction      :asc}]
            (for [order-by (lib/order-bys query')]
              (lib/display-info query' order-by))))))
