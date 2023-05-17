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
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))))))

(deftest ^:parallel threading-test
  (is (=? {:database (meta/id)
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
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)}
                      {:lib/type :mbql.stage/mbql
                       :order-by [[:asc
                                   {:lib/uuid string?}
                                   [:field {:lib/uuid string?} (meta/id :venues :id)]]]}
                      {:lib/type :mbql.stage/mbql}]}
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
        (is (=? [{:database-type      "INTEGER"
                  :semantic-type      :type/FK
                  :lib/type           :metadata/field
                  :table-id           (meta/id :venues)
                  :name               "CATEGORY_ID"
                  :has-field-values   :none
                  :lib/source         :source/breakouts
                  :fk-target-field-id (meta/id :categories :id)
                  :effective-type     :type/Integer
                  :id                 (meta/id :venues :category-id)
                  :display-name       "Category ID"
                  :base-type          :type/Integer}
                 {:lib/type     :metadata/field
                  :base-type    :type/Integer
                  :name         "sum_PRICE"
                  :display-name "Sum of Price"
                  :lib/source   :source/aggregations}
                 {:lib/type     :metadata/field
                  :base-type    :type/Float
                  :name         "avg_PRICE_plus_1"
                  :display-name "Average of Price + 1"
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
                  :display-name "Category ID + 1"
                  :base-type    :type/Integer
                  :lib/source   :source/breakouts}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
    (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
      (is (=? [{:lib/type                 :metadata/field
                :name                     "ID"
                :display-name             "ID"
                :id                       (meta/id :venues :id)
                :table-id                 (meta/id :venues)
                :base-type                :type/BigInteger
                :lib/source-column-alias  "ID"
                :lib/desired-column-alias "ID"}
               {:lib/type                 :metadata/field
                :name                     "NAME"
                :display-name             "Name"
                :id                       (meta/id :venues :name)
                :table-id                 (meta/id :venues)
                :base-type                :type/Text
                :lib/source-column-alias  "NAME"
                :lib/desired-column-alias "NAME"}
               {:lib/type                 :metadata/field
                :name                     "CATEGORY_ID"
                :display-name             "Category ID"
                :id                       (meta/id :venues :category-id)
                :table-id                 (meta/id :venues)
                :lib/source-column-alias  "CATEGORY_ID"
                :lib/desired-column-alias "CATEGORY_ID"}
               {:lib/type                 :metadata/field
                :name                     "LATITUDE"
                :display-name             "Latitude"
                :id                       (meta/id :venues :latitude)
                :table-id                 (meta/id :venues)
                :base-type                :type/Float
                :lib/source-column-alias  "LATITUDE"
                :lib/desired-column-alias "LATITUDE"}
               {:lib/type                 :metadata/field
                :name                     "LONGITUDE"
                :display-name             "Longitude"
                :id                       (meta/id :venues :longitude)
                :table-id                 (meta/id :venues)
                :base-type                :type/Float
                :lib/source-column-alias  "LONGITUDE"
                :lib/desired-column-alias "LONGITUDE"}
               {:lib/type                 :metadata/field
                :name                     "PRICE"
                :display-name             "Price"
                :id                       (meta/id :venues :price)
                :table-id                 (meta/id :venues)
                :base-type                :type/Integer
                :lib/source-column-alias  "PRICE"
                :lib/desired-column-alias "PRICE"}
               {:lib/type                 :metadata/field
                :name                     "ID"
                :display-name             "ID"
                :id                       (meta/id :categories :id)
                :table-id                 (meta/id :categories)
                :base-type                :type/BigInteger
                :lib/source-column-alias  "ID"
                :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__ID"}
               {:lib/type                 :metadata/field
                :name                     "NAME"
                :display-name             "Name"
                :id                       (meta/id :categories :name)
                :table-id                 (meta/id :categories)
                :base-type                :type/Text
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
                  :base-type    :type/Integer
                  :name         "Category ID + 1"
                  :display-name "Category ID + 1"
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
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                      (lib/field "VENUES" "CATEGORY_ID")
                                      (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/field
                  :name         "ID"
                  :display-name "ID"
                  :source_alias "Cat"
                  :id           (meta/id :categories :id)
                  :table-id     (meta/id :categories)
                  :base-type    :type/BigInteger}
                 {:lib/type     :metadata/field
                  :name         "NAME"
                  :display-name "Name"
                  :source_alias "Cat"
                  :id           (meta/id :categories :name)
                  :table-id     (meta/id :categories)
                  :base-type    :type/Text}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-source-card-test
  (doseq [varr [#'lib.tu/query-with-card-source-table
                #'lib.tu/query-with-card-source-table-with-result-metadata]
          :let [query (varr)]]
    (testing (str (pr-str varr) \newline (lib.util/format "Query =\n%s" (u/pprint-to-str query)))
      (is (=? [{:name                     "USER_ID"
                :display-name             "User ID"
                :base-type                :type/Integer
                :lib/source               :source/card
                :lib/desired-column-alias "USER_ID"}
               {:name                     "count"
                :display-name             "Count"
                :base-type                :type/Integer
                :lib/source               :source/card
                :lib/desired-column-alias "count"}
               {:name                     "ID"
                :display-name             "ID"
                :base-type                :type/BigInteger
                :lib/source               :source/implicitly-joinable
                :lib/desired-column-alias "USERS__via__USER_ID__ID"}
               {:name                     "NAME"
                :display-name             "Name"
                :base-type                :type/Text
                :lib/source               :source/implicitly-joinable
                :lib/desired-column-alias "USERS__via__USER_ID__NAME"}
               {:name                     "LAST_LOGIN"
                :display-name             "Last Login"
                :base-type                :type/DateTime
                :lib/source               :source/implicitly-joinable
                :lib/desired-column-alias "USERS__via__USER_ID__LAST_LOGIN"}]
              (lib/orderable-columns query)))
      (testing `lib/display-info
        (is (=? [{:name                   "USER_ID"
                  :display-name           "User ID"
                  :table                  {:name "My Card", :display-name "My Card"}
                  :is-from-previous-stage false
                  :is-implicitly-joinable false}
                 {:name                   "count"
                  :display-name           "Count"
                  :table                  {:name "My Card", :display-name "My Card"}
                  :is-from-previous-stage false
                  :is-implicitly-joinable false}
                 {:name                   "ID"
                  :display-name           "ID"
                  :table                  {:name "USERS", :display-name "Users"}
                  :is-from-previous-stage false
                  :is-implicitly-joinable true}
                 {:name                   "NAME"
                  :display-name           "Name"
                  :table                  {:name "USERS", :display-name "Users"}
                  :is-from-previous-stage false
                  :is-implicitly-joinable true}
                 {:name                   "LAST_LOGIN"
                  :display-name           "Last Login"
                  :table                  {:name "USERS", :display-name "Users"}
                  :is-from-previous-stage false
                  :is-implicitly-joinable true}]
                (for [col (lib/orderable-columns query)]
                  (lib/display-info query col))))))))

(deftest ^:parallel orderable-columns-e2e-test
  (testing "Use the metadata returned by `orderable-columns` to add a new order-by to a query."
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :venues)}]}
              query))
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [orderable-columns (lib/orderable-columns query)
              col               (m/find-first #(= (:id %) (meta/id :venues :name)) orderable-columns)
              query'            (lib/order-by query col)]
          (is (=? {:lib/type :mbql/query
                   :database (meta/id)
                   :stages   [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
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
        (let [name-col (m/find-first #(= (:name %) "USER_ID")
                                     (lib/orderable-columns query))]
          (is (=? {:name      "USER_ID"
                   :base-type :type/Integer}
                  name-col))
          (let [query' (lib/order-by query name-col)]
            (is (=? {:stages
                     [{:source-table "card__1"
                       :order-by [[:asc
                                   {}
                                   [:field {:base-type :type/Integer} "USER_ID"]]]}]}
                    query'))
            (is (= "My Card, Sorted by User ID ascending"
                   (lib/describe-query query')))
            (is (= ["User ID ascending"]
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
              (lib/with-fields [(lib/field "VENUES" "ID")
                                (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat")])
              (lib/orderable-columns)))))

(deftest ^:parallel order-bys-with-duplicate-column-names-test
  (testing "Order by stuff should work with two different columns named ID (#29702)"
    (is (=? [{:id                       (meta/id :venues :id)
              :name                     "ID"
              :lib/source               :source/previous-stage
              :lib/type                 :metadata/field
              :base-type                :type/BigInteger
              :effective-type           :type/BigInteger
              :display-name             "ID"
              :table-id                 (meta/id :venues)
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"}
             {:id                       (meta/id :categories :id)
              :name                     "ID"
              :lib/source               :source/previous-stage
              :lib/type                 :metadata/field
              :base-type                :type/BigInteger
              :effective-type           :type/BigInteger
              :display-name             "ID"
              :table-id                 (meta/id :categories)
              :lib/source-column-alias  "Cat__ID"
              :lib/desired-column-alias "Cat__ID"}
             {:id                       (meta/id :categories :name)
              :name                     "NAME"
              :lib/source               :source/previous-stage
              :lib/type                 :metadata/field
              :base-type                :type/Text
              :effective-type           :type/Text
              :display-name             "Name"
              :table-id                 (meta/id :categories)
              :lib/source-column-alias  "Cat__NAME"
              :lib/desired-column-alias "Cat__NAME"}]
            (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                (lib/join (-> (lib/join-clause
                               (meta/table-metadata :categories)
                               [(lib/=
                                 (lib/field "VENUES" "CATEGORY_ID")
                                 (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                              (lib/with-join-alias "Cat")
                              (lib/with-join-fields :all)))
                (lib/with-fields [(lib/field "VENUES" "ID")
                                  (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat")])
                (lib/append-stage)
                (lib/orderable-columns))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-columns-test
  (testing "orderable-columns should return position for normal Fields already included in :order-by (#30568)"
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
               {:display-name "Name",        :lib/source :source/table-defaults}
               {:display-name "Category ID", :lib/source :source/table-defaults}
               {:display-name "Latitude",    :lib/source :source/table-defaults}
               {:display-name "Longitude",   :lib/source :source/table-defaults}
               {:display-name "Price",       :lib/source :source/table-defaults}
               {:display-name "ID",          :lib/source :source/implicitly-joinable}
               {:display-name "Name",        :lib/source :source/implicitly-joinable}]
              (lib/orderable-columns query)))
      (let [orderable-columns (lib/orderable-columns query)
            query' (-> query
                       (lib/order-by (orderable-columns 5))
                       (lib/order-by (orderable-columns 1)))]
        (is (=? {:stages [{:order-by [[:asc {} [:field {} (meta/id :venues :price)]]
                                      [:asc {} [:field {} (meta/id :venues :name)]]]}]}
                query'))
        (is (=? [[:asc {} [:field {} (meta/id :venues :price)]]
                 [:asc {} [:field {} (meta/id :venues :name)]]]
                (lib/order-bys query')))
        (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
                 {:display-name "Name",        :lib/source :source/table-defaults, :order-by-position 1}
                 {:display-name "Category ID", :lib/source :source/table-defaults}
                 {:display-name "Latitude",    :lib/source :source/table-defaults}
                 {:display-name "Longitude",   :lib/source :source/table-defaults}
                 {:display-name "Price",       :lib/source :source/table-defaults, :order-by-position 0}
                 {:display-name "ID",          :lib/source :source/implicitly-joinable}
                 {:display-name "Name",        :lib/source :source/implicitly-joinable}]
                (lib/orderable-columns query')))
        (testing "Introduce a new stage"
          (let [query'' (lib/append-stage query')]
            (is (=? [{:display-name "ID",          :lib/source :source/previous-stage}
                     {:display-name "Name",        :lib/source :source/previous-stage}
                     {:display-name "Category ID", :lib/source :source/previous-stage}
                     {:display-name "Latitude",    :lib/source :source/previous-stage}
                     {:display-name "Longitude",   :lib/source :source/previous-stage}
                     {:display-name "Price",       :lib/source :source/previous-stage}
                     {:display-name "ID",          :lib/source :source/implicitly-joinable}
                     {:display-name "Name",        :lib/source :source/implicitly-joinable}]
                    (lib/orderable-columns query'')))))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-aggregation-test
  (testing "orderable-columns should return position for aggregation refs that are already in :order-by (#30568)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field (meta/id :venues :price))))
                    (lib/aggregate (lib/sum (lib/field (meta/id :venues :id)))))]
      (let [orderable-columns (lib/orderable-columns query)]
        (is (=? [{:display-name "Sum of Price", :lib/source :source/aggregations}
                 {:display-name "Sum of ID",    :lib/source :source/aggregations}]
                orderable-columns))
        (is (empty? (filter :order-by-position orderable-columns))))
      (let [query' (lib/order-by query (first (lib/orderable-columns query)))
            orderable-columns (lib/orderable-columns query')]
        (is (=? [{:display-name "Sum of Price", :lib/source :source/aggregations, :order-by-position 0}
                 {:display-name "Sum of ID", :lib/source :source/aggregations}]
                orderable-columns))
        (is (= 1 (count (filter :order-by-position orderable-columns))))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-joined-columns-test
  (testing "orderable-columns should return position for joined columns that are already in :order-by (#30568)"
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
      (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
               {:display-name "Name",        :lib/source :source/table-defaults}
               {:display-name "Category ID", :lib/source :source/table-defaults}
               {:display-name "Latitude",    :lib/source :source/table-defaults}
               {:display-name "Longitude",   :lib/source :source/table-defaults}
               {:display-name "Price",       :lib/source :source/table-defaults}
               ;; implicitly joinable versions shouldn't be returned either, since we have an explicit join.
               {:display-name "ID",   :lib/source :source/joins}
               {:display-name "Name", :lib/source :source/joins}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (m/find-first #(and (= (:source_alias %) "Cat")
                                                           (= (:display-name %) "Name"))
                                                     (lib/orderable-columns query)))]
        (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
                 {:display-name "Name",        :lib/source :source/table-defaults}
                 {:display-name "Category ID", :lib/source :source/table-defaults}
                 {:display-name "Latitude",    :lib/source :source/table-defaults}
                 {:display-name "Longitude",   :lib/source :source/table-defaults}
                 {:display-name "Price",       :lib/source :source/table-defaults}
                 {:display-name "ID",          :lib/source :source/joins}
                 {:display-name "Name", :lib/source :source/joins, :order-by-position 0}]
                (lib/orderable-columns query')))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-implicitly-joinable-columns-test
  (testing "orderable-columns should return position implicitly joinable columns that are already in :order-by (#30568)"
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
      (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
               {:display-name "Name",        :lib/source :source/table-defaults}
               {:display-name "Category ID", :lib/source :source/table-defaults}
               {:display-name "Latitude",    :lib/source :source/table-defaults}
               {:display-name "Longitude",   :lib/source :source/table-defaults}
               {:display-name "Price",       :lib/source :source/table-defaults}
               {:display-name "ID",          :lib/source :source/implicitly-joinable}
               {:display-name "Name",        :lib/source :source/implicitly-joinable, :order-by-position 0}]
              (lib/orderable-columns query))))))

(deftest ^:parallel orderable-columns-exclude-already-sorted-expression-test
  (testing "orderable-columns should return position for expressions that are already in :order-by (#30568)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "My Expression" (lib/+ 2 3)))]
      (is (=? [{:display-name "ID",            :lib/source :source/table-defaults}
               {:display-name "Name",          :lib/source :source/table-defaults}
               {:display-name "Category ID",   :lib/source :source/table-defaults}
               {:display-name "Latitude",      :lib/source :source/table-defaults}
               {:display-name "Longitude",     :lib/source :source/table-defaults}
               {:display-name "Price",         :lib/source :source/table-defaults}
               {:display-name "My Expression", :lib/source :source/expressions}
               {:display-name "ID",            :lib/source :source/implicitly-joinable}
               {:display-name "Name",          :lib/source :source/implicitly-joinable}]
              (lib/orderable-columns query)))
      (let [query' (lib/order-by query (m/find-first #(= (:display-name %) "My Expression")
                                                     (lib/orderable-columns query)))]
        (is (=? [{:display-name "ID",            :lib/source :source/table-defaults}
                 {:display-name "Name",          :lib/source :source/table-defaults}
                 {:display-name "Category ID",   :lib/source :source/table-defaults}
                 {:display-name "Latitude",      :lib/source :source/table-defaults}
                 {:display-name "Longitude",     :lib/source :source/table-defaults}
                 {:display-name "Price",         :lib/source :source/table-defaults}
                 {:display-name "My Expression", :lib/source :source/expressions, :order-by-position 0}
                 {:display-name "ID",            :lib/source :source/implicitly-joinable}
                 {:display-name "Name",          :lib/source :source/implicitly-joinable}]
                (lib/orderable-columns query')))))))

(deftest ^:parallel order-by-aggregation-test
  (testing "Should be able to order by an aggregation (#30089)"
    (let [query             (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                                (lib/aggregate (lib/avg (lib/+ (lib/field "VENUES" "PRICE") 1))))
          {ag-uuid :lib/source-uuid} (first (lib/aggregations-metadata query))
          orderable-columns (lib/orderable-columns query)]
      (is (=? [{:lib/type         :metadata/field
                :base-type        :type/Float
                :display-name     "Average of Price + 1"
                :lib/source       :source/aggregations
                :lib/source-uuid  ag-uuid}]
              orderable-columns))
      (let [ag-ref (first orderable-columns)
            query' (lib/order-by query ag-ref)]
        (is (=? {:stages
                 [{:aggregation [[:avg {} [:+ {} [:field {} (meta/id :venues :price)] 1]]]
                   :order-by    [[:asc {} [:aggregation {:effective-type :type/Float} ag-uuid]]]}]}
                query'))
        (is (=? [[:asc {} [:aggregation {:effective-type :type/Float} ag-uuid]]]
                (lib/order-bys query')))
        (is (=? [{:display-name "Average of Price + 1"
                  :direction    :asc}]
                (map (partial lib/display-info query') (lib/order-bys query'))))
        (is (= "Venues, Average of Price + 1, Sorted by Average of Price + 1 ascending"
               (lib/describe-query query')))
        (testing "With another stage added"
          (let [query'' (lib/append-stage query')]
            (is (=? {:stages
                     [{:aggregation [[:avg {} [:+ {} [:field {} (meta/id :venues :price)] 1]]]
                       :order-by    [[:asc {} [:aggregation {} ag-uuid]]]}
                      {}]}
                    query''))
            (is (=? []
                    (map (partial lib/display-info query'') (lib/order-bys query''))))
            (is (= "Venues, Average of Price + 1, Sorted by Average of Price + 1 ascending"
                   (lib/describe-query query'')))))))))

(deftest ^:parallel order-by-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                  (lib/with-fields [(lib/field "VENUES" "ID")]))]
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :display-name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :display-name "Name",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :display-name "Category ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :display-name "Latitude",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :display-name "Longitude",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :display-name "Price",       :lib/source :source/table-defaults}
             {:name "expr", :display-name "expr", :lib/source :source/expressions}
             {:id (meta/id :categories :id),   :name "ID",   :display-name "ID",   :lib/source :source/implicitly-joinable}
             {:id (meta/id :categories :name), :name "NAME", :display-name "Name", :lib/source :source/implicitly-joinable}]
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
    (is (=? [{:semantic-type          :type/PK
              :is-calculated          false
              :table                  {:name "VENUES", :display-name "Venues" :is-source-table true}
              :name                   "ID"
              :is-from-previous-stage false
              :is-implicitly-joinable false
              :effective-type         :type/BigInteger
              :is-from-join false
              :display-name           "ID"}
             {:display-name "Name"
              :table {:is-source-table true}}
             {:display-name "Category ID"
              :table {:is-source-table true}}
             {:display-name "Latitude"
              :table {:is-source-table true}}
             {:display-name "Longitude"
              :table {:is-source-table true}}
             {:display-name "Price"
              :table {:is-source-table true}}
             {:display-name "ID"
              :table {:name "CATEGORIES" :display-name "Categories" :is-source-table false}}
             {:display-name "Name"
              :table {:name "CATEGORIES" :display-name "Categories" :is-source-table false}}]
            (for [col (lib/orderable-columns query)]
              (lib/display-info query col))))))

(deftest ^:parallel order-bys-display-info-test
  (let [query             (lib/query-for-table-name meta/metadata-provider "VENUES")
        orderable-columns (lib/orderable-columns query)
        col               (m/find-first #(= (:id %) (meta/id :venues :name)) orderable-columns)
        _                 (is (some? col))
        query'            (lib/order-by query col)]
    (is (=? [{:name           "NAME"
              :display-name   "Name"
              :semantic-type  :type/Name
              :effective-type :type/Text
              :table          {:name "VENUES", :display-name "Venues"}
              :direction      :asc}]
            (for [order-by (lib/order-bys query')]
              (lib/display-info query' order-by))))
    (is (=? [{:display-name "ID"}
             {:display-name "Name", :order-by-position 0}
             {:display-name "Category ID"}
             {:display-name "Latitude"}
             {:display-name "Longitude"}
             {:display-name "Price"}
             {:display-name "ID"}
             {:display-name "Name"}]
            (for [orderable-column (lib/orderable-columns query')]
              (lib/display-info query' orderable-column))))))

(deftest ^:parallel change-direction-test
  (doseq [[dir opposite] {:asc :desc, :desc :asc}]
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/order-by (lib/field "VENUES" "ID") dir))
          current-order-by (first (lib/order-bys query))
          new-query (lib/change-direction query current-order-by)
          new-order-by (first (lib/order-bys new-query))]
      (is (= dir (first current-order-by)))
      (is (= opposite (first new-order-by)))
      (is (= (assoc-in query [:stages 0 :order-by 0 0] opposite)
             new-query)))))
