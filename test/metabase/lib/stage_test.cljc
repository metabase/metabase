(ns metabase.lib.stage-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are coming back the way we'd expect for :field clauses"
    (let [query {:lib/type     :mbql/query
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "0311c049-4973-4c2a-8153-1e2c887767f9"}
                                 :source-table (meta/id :venues)
                                 :fields       [(lib.tu/field-clause :venues :price)]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (is (mr/validate ::lib.schema/query query))
      (is (=? [(merge (m/filter-vals some? (meta/field-metadata :venues :price))
                      {:lib/source :source/table-defaults})]
              (lib/returned-columns query))))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (let [query (-> (lib.tu/venues-query)
                      (lib/aggregate (lib/* 0.8 (lib/avg (meta/field-metadata :venues :price))))
                      (lib/aggregate (lib/* 0.8 (lib/avg (meta/field-metadata :venues :price)))))]
        (is (=? [{:base-type                :type/Float
                  :lib/original-name        "expression"
                  :lib/deduplicated-name    "expression"
                  :name                     "expression"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression"}
                 {:base-type                :type/Float
                  :lib/original-name        "expression"
                  :lib/deduplicated-name    "expression_2"
                  :name                     "expression_2"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression_2"}]
                (lib/returned-columns query)))))))

(deftest ^:parallel stage-display-name-card-source-query
  (let [query (lib.tu/query-with-source-card)]
    (is (= "My Card"
           (lib/display-name query)))))

(deftest ^:parallel adding-and-removing-stages
  (let [query                (lib.tu/venues-query)
        query-with-new-stage (-> query
                                 lib/append-stage
                                 (lib/order-by 1 (meta/field-metadata :venues :name) :asc))]
    (is (= 0 (count (lib/order-bys query-with-new-stage 0))))
    (is (= 1 (count (lib/order-bys query-with-new-stage 1))))
    (is (= query
           (-> query-with-new-stage
               (lib/filter (lib/= 1 (meta/field-metadata :venues :name)))
               (lib/drop-stage))))
    (testing "Dropping with 1 stage should no-op"
      (is (= query (lib/drop-stage query))))))

(deftest ^:parallel drop-empty-stages-test
  (let [base  (lib.tu/venues-query)
        query (lib/append-stage base)]
    (testing "Dropping new stage works"
      (is (= base (lib/drop-empty-stages query))))
    (testing "Dropping only stage is idempotent"
      (is (= base (lib/drop-empty-stages (lib/drop-empty-stages query)))))
    (testing "Can drop stage after removing the last"
      (testing "breakout"
        (let [query (lib/breakout query (first (lib/visible-columns query)))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/breakouts query))))))))
      (testing "aggregation"
        (let [query (lib/aggregate query (lib/count))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/aggregations query))))))))
      (testing "join"
        (let [query (lib/join query (meta/table-metadata :categories))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/joins query))))))))
      (testing "field"
        (let [query (lib/with-fields query [(meta/field-metadata :venues :id)])]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/fields query))))))))
      (testing "expression"
        (let [query (lib/expression query "foobar" (lib/+ 1 1))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/expressions query))))))))
      (testing "filter"
        (let [query (lib/filter query (lib/= 1 1))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/filters query))))))))
      (testing "order-by"
        (let [query (lib/order-by query (meta/field-metadata :venues :id))]
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query))))
          (is (= base (lib/drop-empty-stages (lib/remove-clause query (first (lib/order-bys query))))))))
      (testing "multiple empty stages"
        (let [query (-> query
                        (lib/append-stage)
                        (lib/append-stage)
                        (lib/aggregate (lib/count))
                        (lib/append-stage))]
          (is (= 5 (lib/stage-count query)))
          (is (= 2 (lib/stage-count (lib/drop-empty-stages query)))))))))

(defn- query-with-expressions []
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "ID + 1" (lib/+ (meta/field-metadata :venues :id) 1))
                  (lib/expression "ID + 2" (lib/+ (meta/field-metadata :venues :id) 2)))]
    (is (=? {:stages [{:expressions [[:+ {:lib/expression-name "ID + 1"} [:field {} (meta/id :venues :id)] 1]
                                     [:+ {:lib/expression-name "ID + 2"} [:field {} (meta/id :venues :id)] 2]]}]}
            query))
    query))

(deftest ^:parallel default-fields-metadata-include-expressions-test
  (testing "all expressions should come back by default if `:fields` is not specified (#29734)"
    (is (=? [{:id (meta/id :venues :id),          :name "ID",          :lib/source :source/table-defaults}
             {:id (meta/id :venues :name),        :name "NAME",        :lib/source :source/table-defaults}
             {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
             {:id (meta/id :venues :latitude),    :name "LATITUDE",    :lib/source :source/table-defaults}
             {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :lib/source :source/table-defaults}
             {:id (meta/id :venues :price),       :name "PRICE",       :lib/source :source/table-defaults}
             {:name "ID + 1", :lib/source :source/expressions}
             {:name "ID + 2", :lib/source :source/expressions}]
            (lib/returned-columns (query-with-expressions))))))

(deftest ^:parallel default-fields-metadata-return-expressions-before-joins-test
  (testing "expressions should come back BEFORE columns from joins"
    (let [query (-> (query-with-expressions)
                    (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all)
                                  (lib/with-join-conditions [(lib/=
                                                              (meta/field-metadata :venues :category-id)
                                                              (-> (meta/field-metadata :categories :id) (lib/with-join-alias "Cat")))]))))]
      (is (=? {:stages [{:joins       [{:alias      "Cat"
                                        :stages     [{:source-table (meta/id :categories)}]
                                        :conditions [[:=
                                                      {}
                                                      [:field {} (meta/id :venues :category-id)]
                                                      [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
                                        :fields     :all}]
                         :expressions [[:+ {:lib/expression-name "ID + 1"} [:field {} (meta/id :venues :id)] 1]
                                       [:+ {:lib/expression-name "ID + 2"} [:field {} (meta/id :venues :id)] 2]]}]}
              query))
      (let [metadata (lib/returned-columns query)]
        (is (=? [{:id (meta/id :venues :id), :name "ID", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :name), :name "NAME", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :latitude), :name "LATITUDE", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :longitude), :name "LONGITUDE", :lib/source :source/table-defaults}
                 {:id (meta/id :venues :price), :name "PRICE", :lib/source :source/table-defaults}
                 {:name "ID + 1", :lib/source :source/expressions}
                 {:name "ID + 2", :lib/source :source/expressions}
                 {:id                       (meta/id :categories :id)
                  :name                     "ID_2"
                  :lib/source               :source/joins
                  :source-alias             "Cat"
                  :display-name             "ID"
                  :lib/source-column-alias  "ID"
                  :lib/desired-column-alias "Cat__ID"}
                 {:id                       (meta/id :categories :name)
                  :name                     "NAME_2"
                  :lib/source               :source/joins
                  :source-alias             "Cat"
                  :display-name             "Name"
                  :lib/source-column-alias  "NAME"
                  :lib/desired-column-alias "Cat__NAME"}]
                metadata))
        (testing ":long display names"
          (is (= ["ID"
                  "Name"
                  "Category ID"
                  "Latitude"
                  "Longitude"
                  "Price"
                  "ID + 1"
                  "ID + 2"
                  "Cat → ID"
                  "Cat → Name"]
                 (mapv #(lib/display-name query -1 % :long) metadata))))))))

(deftest ^:parallel query-with-source-card-include-implicit-columns-test
  (testing "visible-columns should include implicitly joinable columns when the query has a source Card (#30046)"
    (doseq [varr [#'lib.tu/query-with-source-card
                  #'lib.tu/query-with-source-card-with-result-metadata]
            :let [query (@varr)]]
      (testing (pr-str varr)
        (is (=? [{:name         "USER_ID"
                  :display-name "User ID"
                  :base-type    :type/Integer
                  :lib/source   :source/card}
                 {:name         "count"
                  :display-name "Count"
                  :base-type    :type/Integer
                  :lib/source   :source/card}
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
                (lib/visible-columns query)))))))

(deftest ^:parallel do-not-propagate-temporal-units-to-next-stage-text
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/with-fields [(lib/with-temporal-bucket (meta/field-metadata :checkins :date) :year)])
                  lib/append-stage)
        cols (lib/visible-columns query)]
    (is (= [nil]
           (map lib/temporal-bucket cols)))
    (is (=? [[:field
              (fn expected-opts? [opts]
                (and
                 ;; should retain the effective type of `:type/Integer` since `:year` is an extraction operation.
                 (= (:base-type opts) :type/Date)
                 (= (:effective-type opts) :type/Integer)
                 (not (:temporal-unit opts))))
              "DATE"]]
            (map lib/ref cols)))))

(deftest ^:parallel fields-should-not-hide-joined-fields
  (let [query (-> (lib.tu/venues-query)
                  (lib/with-fields [(meta/field-metadata :venues :id)
                                    (meta/field-metadata :venues :name)])
                  (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                (lib/with-join-alias "Cat")
                                (lib/with-join-fields :all)
                                (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :category-id)
                                                                  (meta/field-metadata :categories :id))])))
                  (lib/append-stage))]
    (is (=? [{:base-type :type/BigInteger
              :semantic-type :type/PK
              :name "ID"
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger
              :lib/source-column-alias "ID"
              :display-name "ID"}
             {:base-type :type/Text
              :semantic-type :type/Name
              :name "NAME"
              :lib/source :source/previous-stage
              :effective-type :type/Text
              :lib/source-column-alias "NAME"
              :display-name "Name"}
             {:base-type :type/BigInteger
              :semantic-type :type/PK
              :name "ID"
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger
              :lib/source-column-alias "Cat__ID"
              :display-name "ID"}
             {:base-type :type/Text
              :semantic-type :type/Name
              :name "NAME"
              :lib/source :source/previous-stage
              :effective-type :type/Text
              :lib/source-column-alias "Cat__NAME"
              :display-name "Name"}]
            (lib/visible-columns query)))))

(deftest ^:parallel expression-breakout-visible-column
  (testing "expression breakouts are handled by visible-columns"
    (let [expr-name "ID + 1"
          query (-> (query-with-expressions)
                    (lib/breakout [:expression {:lib/uuid (str (random-uuid))} expr-name]))]
      (is (=? [{:lib/type :metadata/column
                :lib/source :source/expressions}]
              (filter #(= (:name %) expr-name)
                      (lib/visible-columns query)))))))

(defn- metadata-for-breakouts-from-joins-test-query
  "A query against `ORDERS` with joins against `PRODUCTS` and `PEOPLE`, and breakouts on columns from both of those
  joins."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                    (lib/with-join-alias "P1")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :orders :product-id)
                                                      (-> (meta/field-metadata :products :id)
                                                          (lib/with-join-alias "P1")))])))
      (lib/join (-> (lib/join-clause (meta/table-metadata :people))
                    (lib/with-join-alias "People")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :orders :user-id)
                                                      (-> (meta/field-metadata :people :id)
                                                          (lib/with-join-alias "People")))])))
      (lib/breakout (-> (meta/field-metadata :products :category)
                        (lib/with-join-alias "P1")))
      (lib/breakout (-> (meta/field-metadata :people :source)
                        (lib/with-join-alias "People")))
      (lib/aggregate (lib/count))))

(deftest ^:parallel metadata-for-breakouts-from-joins-test
  (testing "metadata for breakouts of joined columns should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-test-query)]
      (is (= [{:name                     "CATEGORY"
               :lib/source-column-alias  "CATEGORY"
               ::lib.join/join-alias     "P1"
               :lib/desired-column-alias "P1__CATEGORY"}
              {:name                     "SOURCE"
               :lib/source-column-alias  "SOURCE"
               ::lib.join/join-alias     "People"
               :lib/desired-column-alias "People__SOURCE"}
              {:name                     "count"
               :lib/source-column-alias  "count"
               :lib/desired-column-alias "count"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))

(defn- metadata-for-breakouts-from-joins-test-query-2
  "A query against `REVIEWS` joining `PRODUCTS`."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :reviews))
      (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                    (lib/with-join-alias "P2")
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :reviews :product-id)
                                                      (-> (meta/field-metadata :products :id)
                                                          (lib/with-join-alias "P2")))])))
      (lib/breakout (-> (meta/field-metadata :products :category)
                        (lib/with-join-alias "P2")))
      (lib/aggregate (lib/avg (meta/field-metadata :reviews :rating)))
      lib/append-stage))

(deftest ^:parallel metadata-for-breakouts-from-joins-test-2
  (testing "metadata for breakouts of joined columns should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-test-query-2)]
      (is (= [{:name "CATEGORY", :lib/source-column-alias "P2__CATEGORY", :lib/desired-column-alias "P2__CATEGORY"}
              {:name "avg", :lib/source-column-alias "avg", :lib/desired-column-alias "avg"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))

(defn- metadata-for-breakouts-from-joins-from-previous-stage-test-query
  "[[metadata-for-breakouts-from-joins-test-query]] but with an additional stage and a join
  against [[metadata-for-breakouts-from-joins-test-query-2]]. This means there are two joins against `PRODUCTS`, one
  from the first stage and one from the nested query in the join in the second stage."
  []
  (-> (metadata-for-breakouts-from-joins-test-query)
      lib/append-stage
      (lib/join (-> (lib/join-clause (metadata-for-breakouts-from-joins-test-query-2))
                    (lib/with-join-alias "Q2")
                    (lib/with-join-conditions [(lib/= (-> (meta/field-metadata :products :category)
                                                          (lib/with-join-alias "P1"))
                                                      (-> (meta/field-metadata :products :category)
                                                          (lib/with-join-alias "Q2")))])))))

(deftest ^:parallel metadata-for-breakouts-from-joins-from-previous-stage-test
  (testing "metadata for breakouts of columns from join in previous stage should be calculated correctly (#29907)"
    (let [query (metadata-for-breakouts-from-joins-from-previous-stage-test-query)]
      (is (= [{:name                     "CATEGORY"
               :lib/source-column-alias  "P1__CATEGORY"
               :lib/desired-column-alias "P1__CATEGORY"}
              {:name                     "SOURCE"
               :lib/source-column-alias  "People__SOURCE"
               :lib/desired-column-alias "People__SOURCE"}
              {:name                     "count"
               :lib/source-column-alias  "count"
               :lib/desired-column-alias "count"}
              {:name                     "CATEGORY_2"
               :lib/source-column-alias  "P2__CATEGORY"
               ::lib.join/join-alias     "Q2"
               :lib/desired-column-alias "Q2__P2__CATEGORY"}
              {:name                     "avg"
               :lib/source-column-alias  "avg"
               ::lib.join/join-alias     "Q2"
               :lib/desired-column-alias "Q2__avg"}]
             (map #(select-keys % [:name :lib/source-column-alias ::lib.join/join-alias :lib/desired-column-alias])
                  (lib/returned-columns query)))))))

(deftest ^:parallel ensure-filter-stage-test
  (testing "no stage is added if the filter stage already exists"
    (doseq [query [(lib.tu/venues-query)
                   (-> (lib.tu/venues-query)
                       (lib/filter (lib/= (meta/field-metadata :venues :category-id) 1)))
                   (-> (lib.tu/venues-query)
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/append-stage))
                   (-> (lib.tu/venues-query)
                       (lib/aggregate (lib/count)))
                   (-> (lib.tu/venues-query)
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/aggregate (lib/count))
                       (lib/append-stage))]]
      (is (= query (lib/ensure-filter-stage query))))))

(deftest ^:parallel ensure-filter-stage-test-2
  (testing "a stage is added if the filter stage doesn't exists yet"
    (doseq [query [(-> (lib.tu/venues-query)
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/aggregate (lib/count)))
                   (-> (lib.tu/venues-query)
                       (lib/breakout (meta/field-metadata :venues :category-id)))
                   (-> (lib.tu/venues-query)
                       (lib/append-stage)
                       (lib/filter (lib/= (meta/field-metadata :venues :category-id) 1))
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/breakout (meta/field-metadata :venues :price)))
                   (-> (lib.tu/venues-query)
                       (lib/filter (lib/= (meta/field-metadata :venues :category-id) 1))
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/aggregate (lib/count)))
                   (-> (lib.tu/venues-query)
                       (lib/append-stage)
                       (lib/breakout (meta/field-metadata :venues :category-id))
                       (lib/aggregate (lib/count))
                       (lib/expression "2price" (lib/* (meta/field-metadata :venues :price) 2)))
                   (let [base (-> (lib.tu/venues-query)
                                  (lib/append-stage)
                                  (lib/breakout (meta/field-metadata :venues :category-id))
                                  (lib/breakout (meta/field-metadata :venues :price))
                                  (lib/aggregate (lib/count))
                                  (lib/append-stage))
                         columns (lib/visible-columns base)
                         by-name #(m/find-first (comp #{%} :name) columns)]
                     (-> base
                         (lib/filter (lib/> (by-name "count") 0))
                         (lib/aggregate (lib/avg (by-name "count")))
                         (lib/breakout (by-name "PRICE"))
                         (lib/breakout (by-name "CATEGORY_ID"))))]]
      (is (= (inc (lib/stage-count query))
             (lib/stage-count (lib/ensure-filter-stage query)))))))

;;; adapted from [[metabase.query-processor.middleware.remove-inactive-field-refs-test/deleted-columns-before-deletion-test-3]]
(deftest ^:parallel add-correct-fields-for-join-test
  (testing "Make sure we do the right thing with deduplicated field refs like ID_2"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(lib.tu.macros/mbql-query orders
                 {:fields [$id $subtotal $tax $total $created-at $quantity]
                  :joins [{:source-table $$products
                           :alias "Product"
                           :condition
                           [:= $orders.product-id
                            [:field %products.id {:join-alias "Product"}]]
                           :fields
                           [[:field %products.id {:join-alias "Product"}] ; AKA ID_2
                            [:field %products.title {:join-alias "Product"}]
                            [:field %products.vendor {:join-alias "Product"}]
                            [:field %products.price {:join-alias "Product"}]
                            [:field %products.rating {:join-alias "Product"}]]}]})])
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query products
                   {:fields [[:field "ID_2"   {:join-alias "Card", :base-type :type/BigInteger}]
                             [:field "TOTAL"  {:join-alias "Card", :base-type :type/Float}]
                             [:field "TAX"    {:join-alias "Card", :base-type :type/Float}]
                             [:field "VENDOR" {:join-alias "Card", :base-type :type/Text}]]
                    :joins [{:source-table "card__1"
                             :alias "Card"
                             :condition
                             [:= $products.id
                              [:field "ID_2" {:join-alias "Card"
                                              :base-type :type/BigInteger}]]
                             :fields
                             [[:field "ID_2" {:join-alias "Card"
                                              :base-type :type/BigInteger}] ; PRODUCTS.ID -- (meta/id :products :id)
                              [:field "TOTAL" {:join-alias "Card"
                                               :base-type :type/Float}]
                              [:field "TAX" {:join-alias "Card"
                                             :base-type :type/Float}]
                              [:field "VENDOR" {:join-alias "Card"
                                                :base-type :type/Text}]]}]}))]
      ;; should include ID as well.
      ;;
      ;; we always use LONG display names when the column comes from a previous stage.
      (is (=? [{:id (meta/id :products :id),    :display-name "Card → ID"}
               {:id (meta/id :orders :total),   :display-name "Card → Total"}
               {:id (meta/id :orders :tax),     :display-name "Card → Tax"}
               {:id (meta/id :products :vendor) :display-name "Card → Vendor"}]
              (lib.metadata.calculation/returned-columns query))))))

(deftest ^:parallel deduplicate-field-from-join-test
  (testing "We should correctly deduplicate columns in :fields and [:join :fields] (#59664)"
    (let [query (lib/query meta/metadata-provider
                           (lib.tu.macros/mbql-query orders
                             {:joins [{:alias        "Q"
                                       :strategy     :left-join
                                       :source-query {:source-table $$reviews
                                                      :joins        [{:alias        "P"
                                                                      :strategy     :left-join
                                                                      :fk-field-id  %orders.product-id
                                                                      :condition    [:=
                                                                                     [:field %orders.product-id nil]
                                                                                     [:field %products.id {:join-alias "P"}]]
                                                                      :source-table $$products}]
                                                      :aggregation  [[:aggregation-options [:count] {:name "count"}]]
                                                      :breakout     [$reviews.product-id]
                                                      :filter       [:=
                                                                     [:field
                                                                      %products.category
                                                                      {:source-field %reviews.product-id
                                                                       :join-alias "P"}]
                                                                     "Doohickey"]
                                                      :order-by     [[:asc $reviews.product-id]]}
                                       :fields    [[:field $reviews.product-id {:join-alias "Q"}]
                                                   [:field "count" {:base-type :type/Integer, :join-alias "Q"}]]
                                       :condition [:=
                                                   $orders.product-id
                                                   [:field %reviews.product-id {:join-alias "Q"}]]}]
                              :fields [$orders.id
                                       $orders.product-id
                                       [:field %reviews.product-id {:join-alias "Q"}]
                                       [:field "count" {:base-type :type/Integer, :join-alias "Q"}]]}))]
      (is (= ["ID"
              "PRODUCT_ID"
              "Q__PRODUCT_ID"
              "Q__count"]
             (map :lib/desired-column-alias (lib/returned-columns query)))))))

(deftest ^:parallel calculate-names-without-truncation-test
  (testing "Do not truncate column `:name` ever (#59665)"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata meta/metadata-provider
                 :stages       [{:lib/type           :mbql.stage/native
                                 :native             "SELECT * FROM whatever"
                                 :lib/stage-metadata {:columns
                                                      [{:database-type  "CHARACTER VARYING"
                                                        :name           "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                        :effective-type :type/Text
                                                        :display-name   "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                        :base-type      :type/Text
                                                        :lib/type       :metadata/column}
                                                       {:database-type  "BIGINT"
                                                        :name           "coun"
                                                        :effective-type :type/BigInteger
                                                        :display-name   "coun"
                                                        :base-type      :type/BigInteger
                                                        :lib/type       :metadata/column}]
                                                      :lib/type :metadata/results}}
                                {:lib/type :mbql.stage/mbql
                                 :fields   [[:field
                                             {:base-type :type/Text, :lib/uuid "48208564-d2f2-462c-9794-1feaed36867a"}
                                             "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"]
                                            [:field
                                             {:base-type :type/BigInteger, :lib/uuid "0f8df0f0-1244-4ca9-aa7f-9134b58e4ea3"}
                                             "coun"]]}]
                 :database     (meta/id)}]
      (doseq [stage-number [0 1]]
        (testing (str "Stage number = " stage-number)
          (is (=? [{:name "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"}
                   {:name "coun"}]
                  (lib/returned-columns query stage-number stage-number {}))))))))

(deftest ^:parallel remapped-columns-in-joined-source-queries-test
  (testing "Remapped columns in joined source queries should work (#15578)"
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :orders :product-id) (meta/id :products :title))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query products
                   {:joins    [{:source-query {:source-table $$orders
                                               :breakout     [$orders.product-id]
                                               :aggregation  [[:sum $orders.quantity]]}
                                :alias        "Orders"
                                :condition    [:= $id &Orders.orders.product-id]
                                ;; we can get title since product-id is remapped to title
                                :fields       [&Orders.title
                                               &Orders.*sum/Integer]}]
                    :fields   [$title $category]}))]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (is (= [[(meta/id :products :title)    "TITLE"         "TITLE"    "Title"]                     ; products.title
                [(meta/id :products :category) "CATEGORY"      "CATEGORY" "Category"]                  ; products.category
                [(meta/id :products :title)    "Orders__TITLE" "TITLE"    "Orders → Title"]            ; orders.product-id -> products.title
                [nil                           "Orders__sum"   "sum"      "Orders → Sum of Quantity"]] ; sum(orders.quantity)
               (map (juxt :id :lib/desired-column-alias :lib/source-column-alias :display-name)
                    (lib.metadata.calculation/returned-columns
                     query
                     -1
                     (lib.util/query-stage query -1)
                     {:include-remaps? true}))))))))

(deftest ^:parallel no-duplicate-remaps-test
  (testing "Do not add duplicate columns when :include-remaps? is true (QUE-1410)"
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :venues :category-id) (meta/id :categories :name))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query venues
                   {:joins  [{:source-table $$categories
                              :condition    [:= 1 1]
                              :alias        "CATEGORIES__via__CATEGORY_ID"
                              :fields       :none}]
                    :fields [$venues.id
                             $venues.name
                             $venues.category-id
                             $venues.latitude
                             $venues.longitude
                             $venues.price
                             ;; this is already here, DO NOT add a duplicate of it.
                             &CATEGORIES__via__CATEGORY_ID.categories.name]}))]
      (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE" "CATEGORIES__via__CATEGORY_ID__NAME"]
             (map :lib/desired-column-alias (lib/returned-columns query -1 -1 {:include-remaps? true})))))))

(deftest ^:parallel propagate-binning-info-test
  (testing "binning info from previous stages should get propagated"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :name          "Q1"
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:aggregation [[:count]]
                                             :breakout    [[:field %total {:binning {:strategy :num-bins, :num-bins 10}}]
                                                           [:field %total {:binning {:strategy :num-bins, :num-bins 50}}]]})}]})
          query (lib/query mp (lib.metadata/card mp 1))]
      (is (=? [{:name "TOTAL", :lib/original-binning {:strategy :num-bins, :num-bins 10}}
               {:name "TOTAL_2", :lib/original-binning {:strategy :num-bins, :num-bins 50}}
               {:name "count"}]
              (lib/returned-columns query -1))))))

(deftest ^:parallel do-not-propagate-lib-expression-names-from-cards-test
  (testing "Columns coming from a source card should not propagate :lib/expression-name"
    (let [q1           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                           (lib/with-fields [(meta/field-metadata :venues :price)])
                           (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2)))
          q1-cols      (lib/returned-columns q1)
          _            (is (=? [{:name "PRICE"}
                                {:name "double-price", :lib/expression-name "double-price"}]
                               q1-cols)
                           "Sanity check: Card metadata is allowed to include :lib/expression-name")
          mp           (lib.tu/mock-metadata-provider
                        meta/metadata-provider
                        ;; note the missing `dataset-query`!! This means we fall back to `:fields` (this is the key
                        ;; used by the FE)
                        {:cards [{:id          1
                                  :database-id (meta/id)
                                  :fields      q1-cols}]})
          q2           (lib/query mp (lib.metadata/card mp 1))
          q3           (-> q2
                           (lib/aggregate (lib/count))
                           (lib.tu.notebook/add-breakout {:display-name "double-price"}))]
      (doseq [f [#'lib/returned-columns
                 #'lib/visible-columns]
              :let [double-price (lib.tu.notebook/find-col-with-spec q3 (f q3) {} {:display-name "double-price"})]]
        (testing f
          (testing "metadata should not include :lib/expression-name"
            (is (=? {:lib/expression-name (symbol "nil #_\"key is not present.\"")}
                    double-price)))
          (testing "should generate a :field ref for double-price"
            (is (=? [:field {} "double-price"]
                    (lib/ref double-price))))
          (testing "Should be able to order by this column"
            (is (=? {:stages [{:source-card 1
                               :order-by [[:asc {} [:field {} "double-price"]]]}]}
                    (lib/order-by q3 double-price)))))))))

(deftest ^:parallel returned-columns-deduplicate-names-test
  (testing (str "Apparently the FE uses `:name` from the `display-info` for viz settings and requires this to match the"
                " one returned by the query processor... make sure we deduplicated them correctly")
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year))
                    (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))]
      (testing "lib/returned-columns should use deduplicated names (like the QP does) for `:name`"
        (is (=? [{:lib/original-name     "CREATED_AT"
                  :lib/deduplicated-name "CREATED_AT"
                  :name                  "CREATED_AT"
                  :display-name          "Created At: Year"}
                 {:lib/original-name     "CREATED_AT"
                  :lib/deduplicated-name "CREATED_AT_2"
                  :name                  "CREATED_AT_2"
                  :display-name          "Created At: Month"}
                 {:lib/original-name     "count"
                  :lib/deduplicated-name "count"
                  :name                  "count"
                  :display-name          "Count"}]
                (map #(select-keys % [:lib/original-name :lib/deduplicated-name :name :display-name])
                     (lib/returned-columns query 0)))))
      (testing "display-info should propagate the deduplicated names"
        (is (=? [{:name         "CREATED_AT"
                  :display-name "Created At: Year"}
                 {:name         "CREATED_AT_2"
                  :display-name "Created At: Month"}
                 {:name         "count"
                  :display-name "Count"}]
                (map #(lib/display-info query %)
                     (lib/returned-columns query)))))
      (testing "only make :name == :lib/deduplicated-name for the LAST stage of the query, so we don't break more stuff"
        (let [query' (lib/append-stage query)]
          (are [stage-number expected] (= expected
                                          (map :name (lib/returned-columns query' stage-number (lib.util/query-stage query' stage-number))))
            0  ["CREATED_AT" "CREATED_AT" "count"]
            1  ["CREATED_AT" "CREATED_AT_2" "count"]))))))

(deftest ^:parallel do-not-duplicate-columns-with-default-temporal-bucketing-test
  (testing "Do not add a duplicate column from a join if it uses :default temporal bucketing"
    (doseq [temporal-unit           [nil :default]
            base-type               [nil :type/Date]
            effective-type          [nil :type/Date]
            inherited-temporal-unit [nil :default]
            ;; make sure random keys don't affect this either
            nonsense-key            [nil 1337]
            lib-key                 [nil "PRODUCTS"]
            :let                    [opts (cond-> {:join-alias "People"}
                                            temporal-unit           (assoc :temporal-unit temporal-unit)
                                            base-type               (assoc :base-type base-type)
                                            effective-type          (assoc :effective-type effective-type)
                                            inherited-temporal-unit (assoc :inherited-temporal-unit inherited-temporal-unit)
                                            nonsense-key            (assoc :nonsense-key nonsense-key)
                                            lib-key                 (assoc :lib/nonsense-key lib-key))
                                     clause [:field (meta/id :people :birth-date) opts]]]
      (testing (pr-str (lib/->pMBQL clause))
        (testing `lib/returned-columns
          (let [query (lib/query
                       meta/metadata-provider
                       (lib.tu.macros/mbql-query orders
                         {:joins  [{:source-table (meta/id :people)
                                    :alias        "People"
                                    :condition    [:=
                                                   $user-id
                                                   &People.people.id]
                                    :fields       [&People.people.longitude
                                                   &People.!default.people.birth-date]}
                                   {:source-table (meta/id :products)
                                    :alias        "Products"
                                    :condition    [:=
                                                   $product-id
                                                   &Products.products.id]
                                    :fields       [&Products.products.price]}]
                          :fields [$id
                                   &People.people.longitude
                                   clause
                                   &Products.products.price]}))]
            (is (= ["ID"
                    "Longitude"
                    "Birth Date"
                    "Price"]
                   (map :display-name (lib/returned-columns query))))))))))

;;; adapted from [[metabase.query-processor.explicit-joins-test/join-against-saved-question-with-sort-test]]
(deftest ^:parallel join-against-same-table-returned-columns-test
  (testing "Joining against a query that ultimately have the same source table SHOULD result in 'duplicate' columns being included."
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query products
                   {:joins    [{:source-query {:source-table $$products
                                               :aggregation  [[:count]]
                                               :breakout     [$category]
                                               :order-by     [[:asc [:aggregation 0]]]}
                                :alias        "Q1"
                                :condition    [:= $category [:field %category {:join-alias "Q1"}]]
                                :fields       :all}]
                    :order-by [[:asc $id]]
                    :limit    1}))]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (is (= [;; these 8 are from PRODUCTS
                "ID"
                "Ean"
                "Title"
                "Category"
                "Vendor"
                "Price"
                "Rating"
                "Created At"
                ;; the next 2 are from PRODUCTS
                "Q1 → Category"
                "Q1 → Count"]
               (map :display-name (lib/returned-columns query))))))))

(deftest ^:parallel expressions-with-aggregations-and-breakouts-returned-columns-test
  (testing "expressions in :fields should be returned AFTER breakouts and aggregations"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:aggregation [[:count] [:sum $orders.quantity]]
                    :breakout    [$orders.user-id->people.state
                                  $orders.user-id->people.source
                                  $orders.product-id->products.category]
                    :expressions {:test-expr [:ltrim "wheeee"]}
                    :fields      [[:expression "test-expr"]]}))]
      (is (= ["User → State"              ; from breakouts
              "User → Source"             ; from breakouts
              "Product → Category"        ; from breakouts
              "Count"                     ; from aggregations
              "Sum of Quantity"           ; from aggregations
              "test-expr"]                ; from expressions/fields ???
             (binding [lib.metadata.calculation/*display-name-style* :long]
               (mapv :display-name (lib/returned-columns query))))))))

(deftest ^:parallel return-correct-deduplicated-names-test
  (testing "Deduplicated names from previous stage should be preserved even when excluding certain fields"
    ;; e.g. a field called CREATED_AT_2 in the previous stage should continue to be called that. See
    ;; https://metaboat.slack.com/archives/C0645JP1W81/p1750961267171999
    (let [query (-> (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query orders
                       {:source-query {:source-table $$orders
                                       :aggregation  [[:count]]
                                       :breakout     [[:field %created-at {:base-type :type/DateTime, :temporal-unit :year}]
                                                      [:field %created-at {:base-type :type/DateTime, :temporal-unit :month}]]}
                        :filter       [:>
                                       [:field "count" {:base-type :type/Integer}]
                                       0]}))
                    lib/append-stage
                    lib/append-stage
                    (as-> query (lib/remove-field query -1 (first (lib/fieldable-columns query -1)))))]
      (testing "Stage 1 of 3"
        (is (=? [{:name                     "CREATED_AT"
                  :lib/original-name        "CREATED_AT"
                  :lib/deduplicated-name    "CREATED_AT"
                  :lib/source-column-alias  "CREATED_AT"
                  :lib/desired-column-alias "CREATED_AT"
                  :display-name             "Created At: Year"}
                 {:name                     "CREATED_AT"
                  :lib/original-name        "CREATED_AT"
                  :lib/deduplicated-name    "CREATED_AT_2"
                  :lib/source-column-alias  "CREATED_AT"
                  :lib/desired-column-alias "CREATED_AT_2"
                  :display-name             "Created At: Month"}
                 {:name                     "count"
                  :lib/original-name        "count"
                  :lib/deduplicated-name    "count"
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"
                  :display-name             "Count"}]
                (lib/returned-columns query 0))))
      (testing "Stage 2 of 3"
        (is (=? [{:name                     "CREATED_AT"
                  :lib/original-name        "CREATED_AT"
                  :lib/deduplicated-name    "CREATED_AT"
                  :lib/source-column-alias  "CREATED_AT"
                  :lib/desired-column-alias "CREATED_AT"
                  :display-name             "Created At: Year"}
                 {:name                     "CREATED_AT"
                  :lib/original-name        "CREATED_AT"
                  :lib/deduplicated-name    "CREATED_AT_2"
                  :lib/source-column-alias  "CREATED_AT_2"
                  :lib/desired-column-alias "CREATED_AT_2"
                  :display-name             "Created At: Month"}
                 {:name                     "count"
                  :lib/original-name        "count"
                  :lib/deduplicated-name    "count"
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"
                  :display-name             "Count"}]
                (lib/returned-columns query 1))))
      (testing "Stage 3 of 3"
        (is (=? [{:name                     "CREATED_AT_2" ; name should get deduplicated in the last stage for historical reasons
                  :lib/original-name        "CREATED_AT"
                  :lib/deduplicated-name    "CREATED_AT_2"
                  :lib/source-column-alias  "CREATED_AT_2"
                  :lib/desired-column-alias "CREATED_AT_2"
                  :display-name             "Created At: Month"}
                 {:name                     "count"
                  :lib/original-name        "count"
                  :lib/deduplicated-name    "count"
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"
                  :display-name             "Count"}]
                (lib/returned-columns query)))))))

;;; TODO (Cam 8/7/25) -- move these tests that test [[lib.equality/=]] to [[metabase.lib.equality-test]]
(deftest ^:parallel test-QUE-1607
  (testing "do not add duplicate columns whne join uses name refs in :fields (QUE-1607)"
    (is (lib.equality/=
         {:base-type                    :type/Integer
          :display-name                 "Sum of Quantity"
          :effective-type               :type/Integer
          :lib/deduplicated-name        "sum"
          :lib/desired-column-alias     "Orders__sum"
          :lib/original-join-alias      "Orders"
          :lib/original-name            "sum"
          :lib/source                   :source/joins
          :lib/source-column-alias      "sum"
          :lib/source-uuid              "4d059464-4190-40ae-bc4e-717ff016e157"
          :lib/type                     :metadata/column
          :metabase.lib.join/join-alias "Orders"
          :name                         "sum"
          :semantic-type                :type/Quantity
          :source-alias                 "Orders"}
         {:base-type                    :type/Integer
          :display-name                 "Sum"
          :effective-type               :type/Integer
          :lib/original-join-alias      "Orders"
          :lib/source                   :source/joins
          :lib/source-uuid              "91b22976-279d-4052-b269-e4cd83a6683b"
          :lib/type                     :metadata/column
          :metabase.lib.join/join-alias "Orders"
          :name                         "sum"}))))

(deftest ^:parallel column-equality-test
  (let [join-col     {:active                       true
                      :base-type                    :type/Text
                      :caveats                      nil
                      :coercion-strategy            nil
                      :custom-position              0
                      :database-is-auto-increment   false
                      :database-position            2
                      :database-required            false
                      :database-type                "CHARACTER VARYING"
                      :description                  nil
                      :display-name                 "Orders → Title"
                      :effective-type               :type/Text,
                      :fingerprint-version          5
                      :fk-target-field-id           nil
                      :has-field-values             :auto-list
                      :id                           24504
                      :name                         "TITLE"
                      :nfc-path                     nil
                      :parent-id                    nil
                      :points-of-interest           nil
                      :position                     2
                      :preview-display              true
                      :semantic-type                :type/Title
                      :settings                     nil
                      :source-alias                 "Orders"
                      :table-id                     24050
                      :visibility-type              :normal
                      :lib/breakout?                false
                      :lib/original-display-name    "Title"
                      :lib/original-join-alias      "Orders"
                      :lib/original-name            "TITLE"
                      :lib/source                   :source/joins
                      :lib/source-column-alias      "TITLE"
                      :lib/type                     :metadata/column
                      :metabase.lib.join/join-alias "Orders"}
        existing-col {:base-type               :type/Integer
                      :display-name            "Orders → Sum"
                      :name                    "sum"
                      :lib/source              :source/previous-stage
                      :lib/type                :metadata/column
                      :lib/original-join-alias "Orders"}]
    (is (not (lib.equality/= join-col existing-col)))))

(deftest ^:parallel sane-desired-column-aliases-test
  (testing "Do not 'double-dip' a desired-column alias and do `__via__` twice"
    (let [query (lib/query
                 meta/metadata-provider
                 {:lib/type :mbql/query
                  :database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :aggregation  [[:count {}]]
                              :source-table (meta/id :orders)
                              :breakout     [[:field
                                              {:source-field (meta/id :orders :product-id)}
                                              (meta/id :products :category)]]}
                             {:lib/type :mbql.stage/mbql
                              :fields   [[:field
                                          ;; having `:source-field` here AGAIN is probably not necessary since the join
                                          ;; was actually already done in the previous stage; at any rate we should
                                          ;; still return correct info.
                                          {:source-field (meta/id :orders :product-id)}
                                          (meta/id :products :category)]
                                         [:field {:base-type :type/Integer} "count"]]
                              :filters  [[:>
                                          {}
                                          [:field {:base-type :type/Integer} "count"]
                                          0]]}]})]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (doseq [f [#'lib/returned-columns
                   #'lib.metadata.result-metadata/returned-columns]]
          (testing (pr-str f)
            (is (=? [{:name                     "CATEGORY"
                      :display-name             "Product → Category"
                      :lib/source-column-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                      :lib/desired-column-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                      :fk-field-id              (symbol "nil #_\"key is not present.\"")
                      :lib/original-fk-field-id (meta/id :orders :product-id)}
                     {:name                     "count"
                      :display-name             "Count"
                      :lib/source-column-alias  "count"
                      :lib/desired-column-alias "count"}]
                    (f query)))))))))

(deftest ^:parallel propagate-crazy-long-native-identifiers-test
  (testing "respect crazy-long identifiers from native query stages (we need to use these to refer to native columns in the second stage) (#47584)"
    (let [query (lib.tu.macros/mbql-5-query nil
                  {:stages [{:native             "SELECT *"
                             :lib/stage-metadata {:columns [{:base-type                :type/Text
                                                             :database-type            "CHARACTER VARYING"
                                                             :display-name             "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                             :effective-type           :type/Text
                                                             :name                     "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                             :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                             :lib/source               :source/native
                                                             :lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                                                             :lib/type                 :metadata/column}]}}
                            {}
                            {}]})]
      (are [stage-number expected] (=? [expected]
                                       (lib/returned-columns query stage-number))
        0
        {:lib/source               :source/native
         :lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
         :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"}

        1
        {:lib/source               :source/previous-stage
         :lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
         :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_00028d48"}

        2
        {:lib/source               :source/previous-stage
         :lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_00028d48"
         :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_00028d48"}))))
