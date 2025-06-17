(ns metabase.lib.stage-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
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
      (is (=? [(merge (meta/field-metadata :venues :price)
                      {:lib/source :source/fields})]
              (lib/returned-columns query))))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (let [query (-> (lib.tu/venues-query)
                      (lib/aggregate (lib/* 0.8 (lib/avg (meta/field-metadata :venues :price))))
                      (lib/aggregate (lib/* 0.8 (lib/avg (meta/field-metadata :venues :price)))))]
        (is (=? [{:base-type                :type/Float
                  :name                     "expression"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression"
                  :lib/source-uuid          string?}
                 {:base-type                :type/Float
                  :name                     "expression"
                  :display-name             "0.8 × Average of Price"
                  :lib/source-column-alias  "expression"
                  :lib/desired-column-alias "expression_2"
                  :lib/source-uuid          string?}]
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
             {:name "ID + 1", :lib/source :source/expressions, :lib/source-uuid string?}
             {:name "ID + 2", :lib/source :source/expressions, :lib/source-uuid string?}]
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
                  :name                     "ID"
                  :lib/source               :source/joins
                  :source-alias             "Cat"
                  :display-name             "ID"
                  :lib/source-column-alias  "ID"
                  :lib/desired-column-alias "Cat__ID"}
                 {:id                       (meta/id :categories :name)
                  :name                     "NAME"
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
    (is (=? [{:base-type :type/BigInteger,
              :semantic-type :type/PK,
              :name "ID",
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger,
              :lib/desired-column-alias "ID",
              :display-name "ID"}
             {:base-type :type/Text,
              :semantic-type :type/Name,
              :name "NAME",
              :lib/source :source/previous-stage,
              :effective-type :type/Text,
              :lib/desired-column-alias "NAME",
              :display-name "Name"}
             {:base-type :type/BigInteger,
              :semantic-type :type/PK,
              :name "ID",
              :lib/source :source/previous-stage
              :effective-type :type/BigInteger,
              :lib/desired-column-alias "Cat__ID",
              :display-name "ID"}
             {:base-type :type/Text,
              :semantic-type :type/Name,
              :name "NAME",
              :lib/source :source/previous-stage
              :effective-type :type/Text,
              :lib/desired-column-alias "Cat__NAME",
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
              {:name                     "CATEGORY"
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
      (is (=? [{:id (meta/id :products :id),    :display-name "ID 2"} ; not 100% sure about this display name
               {:id (meta/id :orders :total),   :display-name "Total"}
               {:id (meta/id :orders :tax),     :display-name "Tax"}
               {:id (meta/id :products :vendor) :display-name "Vendor"}]
              (lib.metadata.calculation/returned-columns query))))))

(deftest ^:parallel deduplicate-field-from-join-test
  (testing "We should correctly deduplicate columns in :fields and [:join :fields] (QUE-1330)"
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
  (testing "Do not truncate column `:name` ever (QUE-1341)"
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
                  (lib/returned-columns query
                                        stage-number
                                        (lib.util/query-stage query stage-number)
                                        {:unique-name-fn (fn f
                                                           ([]  f)
                                                           ([s] s))}))))))))

(deftest ^:parallel visible-columns-test
  (testing "Visible columns for a stage SHOULD NOT include columns not returned by joins (#59588)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:joins [{:strategy     :left-join
                             :source-table $$categories
                             :alias        "C"
                             :condition    [:= $venues.id &C.categories.id]
                             :fields       [&C.categories.id]}]
                    :fields [$id $name]}))
          ;; should NOT include `C__NAME` since that is not returned by join `C` and is thus NOT VISIBLE
          expected [{:name "ID"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "ID"
                     :lib/desired-column-alias "ID"}
                    {:name "NAME"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "NAME"
                     :lib/desired-column-alias "NAME"}
                    {:name "CATEGORY_ID"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "CATEGORY_ID"
                     :lib/desired-column-alias "CATEGORY_ID"}
                    {:name "LATITUDE"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "LATITUDE"
                     :lib/desired-column-alias "LATITUDE"}
                    {:name "LONGITUDE"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "LONGITUDE"
                     :lib/desired-column-alias "LONGITUDE"}
                    {:name "PRICE"
                     :lib/source :source/table-defaults
                     :lib/source-column-alias "PRICE"
                     :lib/desired-column-alias "PRICE"}
                    {:name "ID"
                     :lib/source :source/joins
                     :metabase.lib.join/join-alias "C"
                     :lib/source-column-alias "ID"
                     :lib/desired-column-alias "C__ID"
                     :lib/source-uuid string?}]
          visible-columns (fn [query]
                            (map #(select-keys % [:name
                                                  :lib/source
                                                  :metabase.lib.join/join-alias
                                                  :lib/source-column-alias
                                                  :lib/desired-column-alias
                                                  :lib/source-uuid])
                                 (lib/visible-columns query -1 (lib.util/query-stage query -1) {:include-implicitly-joinable? false})))]
      (is (=? expected
              (visible-columns query)))
      (testing "with stage-metadata attached -- should make no difference"
        (let [query' (assoc-in query [:stages 0 :lib/stage-metadata] {:lib/type :metadata/results
                                                                      :columns  (lib.metadata.calculation/returned-columns query)})]
          (is (=? expected
                  (visible-columns query'))))))))

(deftest ^:parallel returned-columns-bad-field-refs-test
  (testing "#59597"
    (doseq [k [:breakout
               :fields]]
      (testing k
        (let [query (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query venues
                       {:source-query {:source-table $$venues
                                       :joins        [{:strategy     :left-join
                                                       :source-table $$categories
                                                       :alias        "Cat"
                                                       :condition    [:= $category-id &Cat.categories.id]
                                                       :fields       [&Cat.categories.name]}]
                                       :fields       [$id
                                                      &Cat.categories.name]}
                        ;; THIS REF IS WRONG -- it should not be using `Cat` because the join is in the source query rather than
                        ;; in the current stage. However, we should be smart enough to try to figure out what they meant.
                        k [&Cat.categories.name]}))]
          (is (=? [{:id                           (meta/id :categories :name)
                    :name                         "NAME"
                    ;; `:lib/source` is broken -- see #59596
                    :lib/source                   (case k
                                                    :breakout :source/breakouts
                                                    :fields   :source/fields)
                    :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
                    :lib/source-column-alias      "Cat__NAME"
                    :lib/desired-column-alias     "Cat__NAME"}]
                  (map #(select-keys % [:id :name :lib/source :metabase.lib.join/join-alias :lib/source-column-alias :lib/desired-column-alias])
                       (lib/returned-columns query)))))))))

(deftest ^:parallel source-column-alias-for-fields-from-join-test
  (testing "#59599"
    (doseq [k [:fields :breakout]]
      (testing k
        (let [query (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query orders
                       {:joins  [{:strategy     :left-join
                                  :condition    [:= &Q2.products.category 1]
                                  :alias        "Q2"
                                  :source-query {:source-table $$reviews
                                                 :aggregation  [[:aggregation-options [:avg $reviews.rating] {:name "avg"}]]
                                                 :breakout     [&P2.products.category]
                                                 :joins        [{:strategy     :left-join
                                                                 :source-table $$products
                                                                 :condition    [:= $reviews.product-id &P2.products.id]
                                                                 :alias        "P2"
                                                                 :fields       [&P2.products.category]}]}
                                  :fields [&Q2.products.category
                                           [:field "avg" {:base-type :type/Number, :join-alias "Q2"}]]}]
                        k [[:field %products.category {:join-alias "Q2"}]
                           [:field "avg" {:base-type :type/Integer, :join-alias "Q2"}]]}))]
          (testing "join"
            (is (= [{:lib/source-column-alias "P2__CATEGORY", :lib/desired-column-alias "Q2__P2__CATEGORY"}
                    {:lib/source-column-alias "avg", :lib/desired-column-alias "Q2__avg"}]
                   (map #(select-keys % [:lib/source-column-alias :lib/desired-column-alias])
                        (lib/returned-columns query -1 (m/find-first #(= (lib/current-join-alias %) "Q2")
                                                                     (lib/joins query -1)))))))
          (testing "top level"
            (is (= [{:lib/source-column-alias "P2__CATEGORY", :lib/desired-column-alias "Q2__P2__CATEGORY"}
                    {:lib/source-column-alias "avg", :lib/desired-column-alias "Q2__avg"}]
                   (map #(select-keys % [:lib/source-column-alias :lib/desired-column-alias])
                        (lib/returned-columns query))))))))))
