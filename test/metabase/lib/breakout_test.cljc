(ns metabase.lib.breakout-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.core :as lib]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.mocks-31368 :as lib.tu.mocks-31368]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel query-name-with-breakouts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :checkins :date) :year)))]
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table (meta/id :checkins)
                         :aggregation  [[:count {}]]
                         :breakout     [[:field
                                         {:base-type :type/Date, :temporal-unit :year}
                                         (meta/id :checkins :date)]]}]}
            query))
    (is (= "Checkins, Count, Grouped by Date: Year"
           (lib/display-name query query)
           (lib/describe-query query)
           (lib/suggested-name query)))))

(deftest ^:parallel breakouts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/breakout (meta/field-metadata :checkins :date)))]
    (is (=? [[:field {} (meta/id :checkins :date)]]
            (lib/breakouts query)))))

(deftest ^:parallel breakout-should-drop-invalid-parts
  (let [query (-> (lib.tu/venues-query)
                  (lib/with-fields [(meta/field-metadata :venues :price)])
                  (lib/order-by (meta/field-metadata :venues :price))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                                 [(lib/=
                                                   (meta/field-metadata :venues :category-id)
                                                   (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                (lib/with-join-fields [(meta/field-metadata :categories :id)])))
                  (lib/append-stage)
                  (lib/with-fields [(meta/field-metadata :venues :price)])
                  (lib/breakout 0 (meta/field-metadata :venues :category-id)))
        first-stage (lib.util/query-stage query 0)
        first-join (first (lib/joins query 0))]
    (is (= 1 (count (:stages query))))
    (is (not (contains? first-stage :fields)))
    (is (not (contains? first-stage :order-by)))
    (is (= 1 (count (lib/joins query 0))))
    (is (not (contains? first-join :fields))))
  (testing "Already summarized query should be left alone"
    (let [query (-> (lib.tu/venues-query)
                    (lib/breakout (meta/field-metadata :venues :category-id))
                    (lib/order-by (meta/field-metadata :venues :category-id))
                    (lib/append-stage)
                    (lib/breakout 0 (meta/field-metadata :venues :price)))
          first-stage (lib.util/query-stage query 0)]
      (is (= 2 (count (:stages query))))
      (is (contains? first-stage :order-by)))))

(deftest ^:parallel breakoutable-columns-test
  (let [query (lib.tu/venues-query)]
    (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
      (is (=? [{:lib/type                 :metadata/column
                :name                     "ID"
                :display-name             "ID"
                :id                       (meta/id :venues :id)
                :table-id                 (meta/id :venues)
                :base-type                :type/BigInteger
                :lib/source-column-alias  "ID"}
               {:lib/type                 :metadata/column
                :name                     "NAME"
                :display-name             "Name"
                :id                       (meta/id :venues :name)
                :table-id                 (meta/id :venues)
                :base-type                :type/Text
                :lib/source-column-alias  "NAME"}
               {:lib/type                 :metadata/column
                :name                     "CATEGORY_ID"
                :display-name             "Category ID"
                :id                       (meta/id :venues :category-id)
                :table-id                 (meta/id :venues)
                :lib/source-column-alias  "CATEGORY_ID"}
               {:lib/type                 :metadata/column
                :name                     "LATITUDE"
                :display-name             "Latitude"
                :id                       (meta/id :venues :latitude)
                :table-id                 (meta/id :venues)
                :base-type                :type/Float
                :lib/source-column-alias  "LATITUDE"}
               {:lib/type                 :metadata/column
                :name                     "LONGITUDE"
                :display-name             "Longitude"
                :id                       (meta/id :venues :longitude)
                :table-id                 (meta/id :venues)
                :base-type                :type/Float
                :lib/source-column-alias  "LONGITUDE"}
               {:lib/type                 :metadata/column
                :name                     "PRICE"
                :display-name             "Price"
                :id                       (meta/id :venues :price)
                :table-id                 (meta/id :venues)
                :base-type                :type/Integer
                :lib/source-column-alias  "PRICE"}
               {:lib/type                 :metadata/column
                :name                     "ID"
                :display-name             "ID"
                :id                       (meta/id :categories :id)
                :table-id                 (meta/id :categories)
                :base-type                :type/BigInteger
                :lib/source-column-alias  "ID"
                :fk-field-id              (meta/id :venues :category-id)}
               {:lib/type                 :metadata/column
                :name                     "NAME"
                :display-name             "Name"
                :id                       (meta/id :categories :name)
                :table-id                 (meta/id :categories)
                :base-type                :type/Text
                :lib/source-column-alias  "NAME"
                :fk-field-id              (meta/id :venues :category-id)}]
              (lib/breakoutable-columns query))))))

(deftest ^:parallel breakoutable-expressions-test
  (testing "orderable-columns should include expressions"
    (let [query (-> (lib.tu/venues-query)
                    (lib/expression "Category ID + 1"  (lib/+ (meta/field-metadata :venues :category-id) 1)))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/column
                  :base-type    :type/Integer
                  :name         "Category ID + 1"
                  :display-name "Category ID + 1"
                  :lib/source   :source/expressions}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/breakoutable-columns query)))))))

(deftest ^:parallel binned-breakouts-test
  (testing "binned breakout columns should have a position (#31437)"
    (let [base-query (lib.tu/venues-query)
          breakoutables (lib/breakoutable-columns base-query)
          price-col (m/find-first #(= (:name %) "PRICE") breakoutables)
          latitude-col (m/find-first #(= (:name %) "LATITUDE") breakoutables)
          binning-opts (lib/available-binning-strategies base-query price-col)
          query (-> base-query
                    (lib/breakout (lib/with-binning price-col (first binning-opts)))
                    (lib/breakout latitude-col))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:display-name "ID"}
                 {:display-name "Name"}
                 {:display-name "Category ID"}
                 {:display-name "Latitude", :breakout-positions [1]}
                 {:display-name "Longitude"}
                 {:display-name "Price", :breakout-positions [0]}
                 {:display-name "ID"}
                 {:display-name "Name"}]
                (lib/breakoutable-columns query)))))))

(deftest ^:parallel multiple-breakouts-for-the-same-column-test
  (testing "multiple breakout positions for the same column"
    (let [base-query         (lib.tu/venues-query)
          column             (meta/field-metadata :venues :price)
          binning-strategies (lib/available-binning-strategies base-query column)
          query              (-> base-query
                                 (lib/breakout (lib/with-binning column (first binning-strategies)))
                                 (lib/breakout (lib/with-binning column (second binning-strategies))))]
      (is (=? [{:display-name "ID"}
               {:display-name "Name"}
               {:display-name "Category ID"}
               {:display-name "Latitude"}
               {:display-name "Longitude"}
               {:display-name "Price", :breakout-positions [0 1]}
               {:display-name "ID"}
               {:display-name "Name"}]
              (lib/breakoutable-columns query)))))
  (testing "should ignore duplicate breakouts without binning strategy or temporal bucket"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :people))
          column     (first (lib/breakoutable-columns base-query))
          query      (-> base-query
                         (lib/breakout column)
                         (lib/breakout column))
          breakouts  (lib/breakouts query)]
      (is (= 1 (count breakouts)))))
  (testing "should ignore duplicate breakouts with the same binning strategy"
    (let [base-query       (lib/query meta/metadata-provider (meta/table-metadata :people))
          column           (meta/field-metadata :people :latitude)
          binning-strategy (first (lib/available-binning-strategies base-query column))
          query            (-> base-query
                               (lib/breakout (lib/with-binning column binning-strategy))
                               (lib/breakout (lib/with-binning column binning-strategy)))
          breakouts        (lib/breakouts query)]
      (is (= 1 (count breakouts)))))
  (testing "should ignore duplicate breakouts with the same temporal bucket"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :people))
          column     (meta/field-metadata :people :birth-date)
          query      (-> base-query
                         (lib/breakout (lib/with-temporal-bucket column :month))
                         (lib/breakout (lib/with-temporal-bucket column :month)))
          breakouts  (lib/breakouts query)]
      (is (= 1 (count breakouts)))))
  (testing "should ignore duplicate breakouts with the same temporal bucket when converting from legacy MBQL"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :people))
          column     (meta/field-metadata :people :birth-date)
          query      (lib/breakout (->> (lib/breakout base-query (lib/with-temporal-bucket column :year))
                                        (lib.query/->legacy-MBQL)
                                        (lib/query meta/metadata-provider))
                                   (lib/with-temporal-bucket column :year))
          breakouts  (lib/breakouts query)]
      (is (= 1 (count breakouts)))))
  (testing "should allow multiple breakouts with different temporal buckets when converting from legacy MBQL"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :people))
          column     (meta/field-metadata :people :birth-date)
          query      (lib/breakout (->> (lib/breakout base-query (lib/with-temporal-bucket column :year))
                                        (lib.query/->legacy-MBQL)
                                        (lib/query meta/metadata-provider))
                                   (lib/with-temporal-bucket column :month))
          breakouts  (lib/breakouts query)]
      (is (= 2 (count breakouts))))))

(deftest ^:parallel breakoutable-explicit-joins-test
  (testing "breakoutable-columns should include columns from explicit joins"
    (let [query (-> (lib.tu/venues-query)
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))))]
      (doseq [[message query] {""
                               query

                               "with an aggregation (#31256)"
                               (lib/aggregate query (lib/avg (lib/with-join-alias (meta/field-metadata :categories :id) "Cat")))}]
        (testing (str message (lib.util/format "Query =\n%s" (u/pprint-to-str query)))
          (is (=? [{:id (meta/id :venues :id) :name "ID"}
                   {:id (meta/id :venues :name) :name "NAME"}
                   {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                   {:id (meta/id :venues :latitude) :name "LATITUDE"}
                   {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                   {:id (meta/id :venues :price) :name "PRICE"}
                   {:lib/type     :metadata/column
                    :name         "ID"
                    :display-name "ID"
                    :source-alias "Cat"
                    :id           (meta/id :categories :id)
                    :table-id     (meta/id :categories)
                    :base-type    :type/BigInteger}
                   {:lib/type     :metadata/column
                    :name         "NAME"
                    :display-name "Name"
                    :source-alias "Cat"
                    :id           (meta/id :categories :name)
                    :table-id     (meta/id :categories)
                    :base-type    :type/Text}]
                  (lib/breakoutable-columns query))))))))

(deftest ^:parallel breakoutable-columns-source-card-test
  (doseq [varr [#'lib.tu/query-with-source-card
                #'lib.tu/query-with-source-card-with-result-metadata]
          :let [query (@varr)]]
    (testing (str (pr-str varr) \newline (lib.util/format "Query =\n%s" (u/pprint-to-str query)))
      (let [columns (lib/breakoutable-columns query)]
        (is (=? [{:name         "USER_ID"
                  :display-name "User ID"
                  :base-type    :type/Integer
                  :lib/source   :source/card}
                 {:name         "count"
                  :display-name "Count"
                  :base-type    :type/Integer
                  :lib/source   :source/card}
                 ;; Implicitly joinable columns
                 {:name         "ID"
                  :display-name "ID"
                  :base-type    :type/BigInteger
                  :lib/source   :source/implicitly-joinable
                  :fk-field-id  (meta/id :checkins :user-id)}
                 {:name         "NAME"
                  :display-name "Name"
                  :base-type    :type/Text
                  :lib/source   :source/implicitly-joinable
                  :fk-field-id  (meta/id :checkins :user-id)}
                 {:name         "LAST_LOGIN"
                  :display-name "Last Login"
                  :base-type    :type/DateTime
                  :lib/source   :source/implicitly-joinable
                  :fk-field-id  (meta/id :checkins :user-id)}]
                columns))
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
                   ;; Implicitly joinable columns
                   {:name                   "ID"
                    :display-name           "ID"
                    :long-display-name      "User → ID"
                    :table                  {:name            "USERS"
                                             :display-name    "Users"
                                             :is-source-table false}
                    :is-from-previous-stage false
                    :is-implicitly-joinable true}
                   {:name                   "NAME"
                    :display-name           "Name"
                    :long-display-name      "User → Name"
                    :table                  {:name            "USERS"
                                             :display-name    "Users"
                                             :is-source-table false}
                    :is-from-previous-stage false
                    :is-implicitly-joinable true}
                   {:name                   "LAST_LOGIN"
                    :display-name           "Last Login"
                    :long-display-name      "User → Last Login"
                    :table                  {:name            "USERS"
                                             :display-name    "Users"
                                             :is-source-table false}
                    :is-from-previous-stage false
                    :is-implicitly-joinable true}]
                  (for [col columns]
                    (lib/display-info query col)))))))))

(deftest ^:parallel breakoutable-columns-e2e-test
  (testing "Use the metadata returned by `breakoutable-columns` to add a new breakout to a query."
    (let [query (lib.tu/venues-query)]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :venues)}]}
              query))
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [breakoutable-columns (lib/breakoutable-columns query)
              col                  (m/find-first #(= (:id %) (meta/id :venues :name)) breakoutable-columns)
              query'               (lib/breakout query col)]
          (is (=? {:lib/type :mbql/query
                   :database (meta/id)
                   :stages   [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
                               :breakout     [[:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]}]}
                  query'))
          (is (=? [[:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]
                  (lib/breakouts query'))))))))

(deftest ^:parallel breakoutable-columns-own-and-implicitly-joinable-columns-e2e-test
  (testing "An implicitly joinable column can be broken out by."
    (let [query (lib.tu/venues-query)
          cat-name-col (m/find-first #(= (:id %) (meta/id :categories :name))
                                     (lib/breakoutable-columns query))
          ven-price-col (m/find-first #(= (:id %) (meta/id :venues :price))
                                      (lib/breakoutable-columns query))
          query' (-> query
                     (lib/breakout cat-name-col)
                     (lib/breakout ven-price-col))
          breakoutables' (lib/breakoutable-columns query')]
      (is (=? {:stages [{:breakout [[:field
                                     {:source-field (meta/id :venues :category-id)}
                                     (meta/id :categories :name)]
                                    [:field
                                     {:lib/uuid string? :base-type :type/Integer}
                                     (meta/id :venues :price)]]}]}
              query'))
      (is (= "Venues, Grouped by Category → Name and Price"
             (lib/describe-query query')))
      (is (=? [{:display-name "ID",          :lib/source :source/table-defaults}
               {:display-name "Name",        :lib/source :source/table-defaults}
               {:display-name "Category ID", :lib/source :source/table-defaults}
               {:display-name "Latitude",    :lib/source :source/table-defaults}
               {:display-name "Longitude",   :lib/source :source/table-defaults}
               {:display-name "Price"        :lib/source :source/table-defaults, :breakout-positions [1]}
               {:display-name "ID",          :lib/source :source/implicitly-joinable}
               {:display-name "Name",        :lib/source :source/implicitly-joinable, :breakout-positions [0]}]
              breakoutables'))
      (is (= 2 (count (filter :breakout-positions breakoutables'))))
      (is (=? [{:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/PK
                :name "ID"
                :effective-type :type/BigInteger
                :is-from-join false
                :display-name "ID"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false}
               {:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/Name
                :name "NAME"
                :effective-type :type/Text
                :is-from-join false
                :display-name "Name"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false}
               {:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/FK
                :name "CATEGORY_ID"
                :effective-type :type/Integer
                :is-from-join false
                :display-name "Category ID"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false}
               {:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/Latitude
                :name "LATITUDE"
                :effective-type :type/Float
                :is-from-join false
                :display-name "Latitude"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false}
               {:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/Longitude
                :name "LONGITUDE"
                :effective-type :type/Float
                :is-from-join false
                :display-name "Longitude"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false}
               {:table {:name "VENUES", :display-name "Venues", :is-source-table true}
                :semantic-type :type/Category
                :name "PRICE"
                :effective-type :type/Integer
                :is-from-join false
                :display-name "Price"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable false
                :breakout-positions [1]}
               {:table {:name "CATEGORIES", :display-name "Categories", :is-source-table false}
                :semantic-type :type/PK
                :name "ID"
                :effective-type :type/BigInteger
                :is-from-join false
                :display-name "ID"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable true}
               {:table {:name "CATEGORIES", :display-name "Categories", :is-source-table false}
                :semantic-type :type/Name
                :name "NAME"
                :effective-type :type/Text
                :is-from-join false
                :display-name "Name"
                :is-from-previous-stage false
                :is-calculated false
                :is-implicitly-joinable true
                :breakout-positions [0]}]
              (map #(lib/display-info query' %) breakoutables'))))))

(deftest ^:parallel breakoutable-columns-with-source-card-e2e-test
  (testing "A column that comes from a source Card (Saved Question/Model/etc) can be broken out by."
    (let [query (lib.tu/query-with-source-card)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [name-col (m/find-first #(= (:name %) "USER_ID")
                                     (lib/breakoutable-columns query))]
          (is (=? {:name      "USER_ID"
                   :base-type :type/Integer}
                  name-col))
          (let [query' (lib/breakout query name-col)]
            (is (=? {:stages
                     [{:source-card 1
                       :breakout    [[:field {:base-type :type/Integer} "USER_ID"]]}]}
                    query'))
            (is (= "My Card, Grouped by User ID"
                   (lib/describe-query query')))
            (is (= ["User ID"]
                   (for [breakout (lib/breakouts query')]
                     (lib/display-name query' breakout))))))))))

(deftest ^:parallel breakoutable-columns-expression-e2e-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                  (lib/with-fields [(meta/field-metadata :venues :id)]))]
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :display-name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :display-name "Name",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :display-name "Category ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :display-name "Latitude",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :display-name "Longitude",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :display-name "Price",       :lib/source :source/table-defaults}
             {:name "expr", :display-name "expr", :lib/source :source/expressions}
             {:id (meta/id :categories :id),   :name "ID",   :display-name "ID",   :lib/source :source/implicitly-joinable}
             {:id (meta/id :categories :name), :name "NAME", :display-name "Name", :lib/source :source/implicitly-joinable}]
            (lib/breakoutable-columns query)))
    (let [expr (m/find-first #(= (:name %) "expr") (lib/breakoutable-columns query))]
      (is (=? {:lib/type   :metadata/column
               :lib/source :source/expressions
               :name       "expr"}
              expr))
      (let [query' (lib/breakout query expr)]
        (is (=? {:stages [{:breakout [[:expression {} "expr"]]}]}
                query'))
        (testing "description"
          (is (= "Venues, Grouped by expr"
                 (lib/describe-query query'))))))))

(deftest ^:parallel breakoutable-columns-new-stage-e2e-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                  (as-> <> (lib/with-fields <> [(meta/field-metadata :venues :id)
                                                (lib/expression-ref <> "expr")]))
                  (lib/append-stage))]
    (is (=? [{:id (meta/id :venues :id), :name "ID", :display-name "ID", :lib/source :source/previous-stage}
             {:name "expr", :display-name "expr", :lib/source :source/previous-stage}]
            (lib/breakoutable-columns query)))
    (let [expr (m/find-first #(= (:name %) "expr") (lib/breakoutable-columns query))]
      (is (=? {:lib/type            :metadata/column
               :lib/source          :source/previous-stage
               :name                "expr"
               :lib/expression-name (symbol "nil #_\"key is not present.\"")}
              expr))
      (let [query' (lib/breakout query expr)]
        (is (=? {:stages [{:lib/type :mbql.stage/mbql, :source-table (meta/id :venues)}
                          {:breakout [[:field {:base-type :type/Date, :effective-type :type/Date} "expr"]]}]}
                query'))
        (testing "description"
          (is (= "Grouped by expr"
                 (lib/describe-query query'))))))))

(deftest ^:parallel breakoutable-columns-include-all-visible-columns-test
  (testing "Include all visible columns, not just projected ones (#31233)"
    (is (= ["ID"
            "NAME"
            "CATEGORY_ID"
            "LATITUDE"
            "LONGITUDE"
            "PRICE"
            "Categories__ID" ; this column is not projected, but should still be returned.
            "Categories__NAME"]
           (map :lib/desired-column-alias
                (-> (lib.tu/venues-query)
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Categories"))])
                                  (lib/with-join-fields [(lib/with-join-alias (meta/field-metadata :categories :name) "Categories")])))
                    lib/breakoutable-columns))))))

(deftest ^:parallel breakoutable-columns-broken-ref-should-be-selected-test
  (testing "Field refs that differ from what we return should still show up as selected if they refer to the same Field (#31482)"
    (doseq [[message field-ref] {;; this ref is basically what we [[lib/breakout]] would have added but doesn't
                                 ;; contain type info, shouldn't matter tho.
                                 "correct ref but missing :base-type/:effective-type"
                                 [:field {:lib/uuid   (str (random-uuid))
                                          :join-alias "Categories"}
                                  (meta/id :categories :name)]

                                 ;; this is a busted Field ref, it's referring to a Field from a joined Table but
                                 ;; does not include `:join-alias`. It should still work anyway.
                                 "busted ref"
                                 [:field {:lib/uuid  (str (random-uuid))
                                          :base-type :type/Text}
                                  (meta/id :categories :name)]}]
      (testing (str \newline message " ref = " (pr-str field-ref))
        (let [query (-> (lib.tu/venues-query)
                        (lib/join (-> (lib/join-clause
                                       (meta/table-metadata :categories)
                                       [(lib/=
                                         (meta/field-metadata :venues :category-id)
                                         (lib/with-join-alias (meta/field-metadata :categories :id) "Categories"))])
                                      (lib/with-join-alias "Categories")
                                      (lib/with-join-fields [(lib/with-join-alias (meta/field-metadata :categories :name) "Categories")])))
                        (lib/breakout field-ref))]
          (is (= [field-ref]
                 (lib/breakouts query)))
          (is (=? {:name               "NAME"
                   :breakout-positions [0]}
                  (m/find-first #(= (:id %) (meta/id :categories :name))
                                (lib/breakoutable-columns query)))))))))

(defn legacy-query-with-broken-breakout []
  (-> (lib.tu.mocks-31368/query-with-legacy-source-card true)
      ;; this is a bad field reference, it does not contain a `:join-alias`. For some reason the FE is generating
      ;; these in drill thrus (in MLv1). We need to figure out how to make stuff work anyway even tho this is
      ;; technically wrong.
      ;;
      ;; Actually a correct reference would be [:field {} "Products__Category"], see #29763
      (lib/breakout [:field {:lib/uuid (str (random-uuid))
                             :base-type :type/Text}
                     (meta/id :products :category)])))

(deftest ^:parallel legacy-query-with-broken-breakout-breakouts-test
  (testing "Handle busted references to joined Fields in broken breakouts from broken drill-thrus (#31482)"
    (let [query (legacy-query-with-broken-breakout)]
      (is (=? [{:name              "CATEGORY"
                :display-name      "Products → Category" ; display-name is always LONG when it comes from a previous stage.
                :long-display-name "Products → Category"
                :effective-type    :type/Text}]
              (map (partial lib/display-info query)
                   (lib/breakouts query)))))))

(deftest ^:parallel legacy-query-with-broken-breakout-breakoutable-columns-test
  (testing "Handle busted references to joined Fields in broken breakouts from broken drill-thrus (#31482)"
    (is (=? {:display-name       "Products → Category"
             :breakout-positions [0]}
            (m/find-first #(= (:id %) (meta/id :products :category))
                          (lib/breakoutable-columns (legacy-query-with-broken-breakout)))))))

(deftest ^:parallel breakout-with-binning-test
  (testing "breakout on a column with binning should preserve the binning"
    (is (=? {:stages [{:aggregation [[:count {}]]
                       :breakout    [[:field
                                      {:binning {:strategy :bin-width, :bin-width 1}}
                                      (meta/id :people :latitude)]]}]}
            (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                (lib/aggregate (lib/count))
                (lib/breakout (lib/with-binning (meta/field-metadata :people :latitude) {:strategy :bin-width, :bin-width 1})))))))

(deftest ^:parallel existing-breakouts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                  (lib/aggregate (lib/count))
                  (lib/breakout (meta/field-metadata :people :latitude))
                  (lib/breakout (lib/with-binning (meta/field-metadata :people :latitude) {:strategy :bin-width, :bin-width 1}))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :latitude) :month))
                  (lib/breakout (meta/field-metadata :people :longitude)))]
    (is (=? [[:field {}
              (meta/id :people :latitude)]
             [:field {:binning {:strategy :bin-width, :bin-width 1}}
              (meta/id :people :latitude)]
             [:field {:temporal-unit :month}
              (meta/id :people :latitude)]]
            (lib.breakout/existing-breakouts query -1 (meta/field-metadata :people :latitude))))))

(deftest ^:parallel existing-breakouts-multiple-implicit-joins-test
  (let [base   (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
        groups (lib/group-columns (lib/breakoutable-columns base))
        by-fk  (m/index-by :fk-field-id groups)
        ;; Implicitly joining on both :created-by and :updated-by.
        name-by-created-by (->> (get by-fk (meta/id :ic/reports :created-by))
                                lib/columns-group-columns
                                (m/find-first #(= (:id %) (meta/id :ic/accounts :name))))
        name-by-updated-by (->> (get by-fk (meta/id :ic/reports :updated-by))
                                lib/columns-group-columns
                                (m/find-first #(= (:id %) (meta/id :ic/accounts :name))))]
    (testing "implicit joins through two FKs to the same column"
      (testing "both exist"
        (is (some? name-by-created-by))
        (is (some? name-by-updated-by)))
      (testing "are distinct"
        (is (not= name-by-created-by name-by-updated-by)))
      (testing "are not considered 'existing breakouts'"
        (is (nil? (-> base
                      (lib/breakout name-by-created-by)
                      (lib.breakout/existing-breakouts -1 name-by-updated-by))))
        (is (nil? (-> base
                      (lib/breakout name-by-updated-by)
                      (lib.breakout/existing-breakouts -1 name-by-created-by))))))))

(deftest ^:parallel existing-breakouts-multiple-explicit-joins-test
  (let [base (-> (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
                 (lib/join (lib/join-clause (meta/table-metadata :ic/accounts)
                                            [(lib/= (meta/field-metadata :ic/reports :created-by)
                                                    (meta/field-metadata :ic/accounts :id))]))
                 (lib/join (lib/join-clause (meta/table-metadata :ic/accounts)
                                            [(lib/= (meta/field-metadata :ic/reports :updated-by)
                                                    (meta/field-metadata :ic/accounts :id))])))
        groups (lib/group-columns (lib/breakoutable-columns base))
        joined (filter #(= (:metabase.lib.column-group/group-type %) :group-type/join.explicit) groups)
        name-by-created-by (->> (nth joined 0)
                                lib/columns-group-columns
                                (m/find-first #(= (:id %) (meta/id :ic/accounts :name))))
        name-by-updated-by (->> (nth joined 1)
                                lib/columns-group-columns
                                (m/find-first #(= (:id %) (meta/id :ic/accounts :name))))]
    (testing "explicit joins through two FKs to the same column"
      (testing "both exist"
        (is (some? name-by-created-by))
        (is (some? name-by-updated-by)))
      (testing "are distinct"
        (is (not= name-by-created-by name-by-updated-by)))
      (testing "are not considered 'existing breakouts'"
        (is (nil? (-> base
                      (lib/breakout name-by-created-by)
                      (lib.breakout/existing-breakouts -1 name-by-updated-by))))
        (is (nil? (-> base
                      (lib/breakout name-by-updated-by)
                      (lib.breakout/existing-breakouts -1 name-by-created-by))))))))

(deftest ^:parallel remove-existing-breakouts-for-column-test
  (let [query  (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                   (lib/aggregate (lib/count))
                   (lib/breakout (meta/field-metadata :people :latitude))
                   (lib/breakout (lib/with-binning (meta/field-metadata :people :latitude) {:strategy :bin-width, :bin-width 1}))
                   (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :people :latitude) :month))
                   (lib/breakout (meta/field-metadata :people :longitude)))
        query' (lib.breakout/remove-existing-breakouts-for-column query (meta/field-metadata :people :latitude))]
    (is (=? {:stages [{:aggregation [[:count {}]]
                       :breakout    [[:field {} (meta/id :people :longitude)]]}]}
            query'))
    (testing "Don't explode if there are no existing breakouts"
      (is (=? {:stages [{:aggregation [[:count {}]]
                         :breakout    [[:field {} (meta/id :people :longitude)]]}]}
              (lib.breakout/remove-existing-breakouts-for-column query' (meta/field-metadata :people :latitude)))))))

(deftest ^:parallel breakout-column-test
  (testing "should find the correct column"
    (let [query      (-> (lib.tu/venues-query)
                         (lib/breakout  (meta/field-metadata :venues :category-id))
                         (lib/breakout  (meta/field-metadata :venues :price))
                         (lib/aggregate (lib/count)))
          category   (meta/field-metadata :venues :category-id)
          price      (meta/field-metadata :venues :price)
          breakouts  (lib/breakouts query)]
      (is (= 2
             (count breakouts)))
      (is (=? category
              (lib.breakout/breakout-column query (first breakouts))))
      (is (=? price
              (lib.breakout/breakout-column query (second breakouts)))))))

(deftest ^:parallel breakout-column-test-2
  (testing "should set the binning strategy from the breakout clause"
    (let [base-query       (lib/query meta/metadata-provider (meta/table-metadata :people))
          column           (meta/field-metadata :people :latitude)
          binning-strategy (first (lib/available-binning-strategies base-query column))
          query            (->> (lib/with-binning column binning-strategy)
                                (lib/breakout base-query))
          breakout         (first (lib/breakouts query))]
      (is (=? {:strategy :default}
              (->> (lib/breakout-column query breakout)
                   (lib/binning)))))))

(deftest ^:parallel breakout-column-test-3
  (testing "should set the temporal unit from the breakout clause"
    (let [base-query (lib/query meta/metadata-provider (meta/table-metadata :people))
          column     (meta/field-metadata :people :birth-date)
          query      (->> (lib/with-temporal-bucket column :month)
                          (lib/breakout base-query))
          breakout   (first (lib/breakouts query))]
      (is (=? {:unit :month}
              (->> (lib/breakout-column query breakout)
                   (lib/temporal-bucket)))))))

(deftest ^:parallel breakoutable-columns-do-not-suggest-remaps-test
  (testing "Do not return column remaps in breakoutable-columns"
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :orders :product-id) (meta/id :products :title))
          query (lib/query mp (meta/table-metadata :orders))]
      (is (= [["Orders"   "ID"]
              ["Orders"   "User ID"]
              ["Orders"   "Product ID"]
              ["Orders"   "Subtotal"]
              ["Orders"   "Tax"]
              ["Orders"   "Total"]
              ["Orders"   "Discount"]
              ["Orders"   "Created At"]
              ["Orders"   "Quantity"]
              ["People"   "User → ID"]
              ["People"   "User → Address"]
              ["People"   "User → Email"]
              ["People"   "User → Password"]
              ["People"   "User → Name"]
              ["People"   "User → City"]
              ["People"   "User → Longitude"]
              ["People"   "User → State"]
              ["People"   "User → Source"]
              ["People"   "User → Birth Date"]
              ["People"   "User → Zip"]
              ["People"   "User → Latitude"]
              ["People"   "User → Created At"]
              ["Products" "Product → ID"]
              ["Products" "Product → Ean"]
              ["Products" "Product → Title"]
              ["Products" "Product → Category"]
              ["Products" "Product → Vendor"]
              ["Products" "Product → Price"]
              ["Products" "Product → Rating"]
              ["Products" "Product → Created At"]]
             (map (comp
                   (juxt #(get-in % [:table :long-display-name]) :long-display-name)
                   #(lib/display-info query %))
                  (lib/breakoutable-columns query)))))))
