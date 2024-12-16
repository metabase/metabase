(ns metabase.lib.metadata.calculation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel calculate-names-even-without-metadata-test
  (testing "Even if metadata is missing, we should still be able to calculate reasonable display names"
    (doseq [query [(-> lib.tu/venues-query
                       (lib/order-by (meta/field-metadata :orders :total)))
                   (-> lib.tu/venues-query
                       (lib/order-by [:field
                                      {:lib/uuid  (str (random-uuid))
                                       :base-type :type/Text}
                                      "TOTAL"]))]]
      (testing (str "\nquery =\n" (u/pprint-to-str query))
        (is (= "Venues, Sorted by Total ascending"
               (lib/suggested-name query)))))))

(deftest ^:parallel long-display-name-test
  (let [query lib.tu/venues-query
        results (->> query
                     lib/visible-columns
                     (map (comp :long-display-name #(lib/display-info query 0 %))))]
    (is (= ["ID" "Name" "Category ID" "Latitude" "Longitude" "Price" "Category → ID" "Category → Name"]
           results)))

  (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        results (->> query
                     lib/visible-columns
                     (map (comp :long-display-name #(lib/display-info query 0 %))))]
    (is (= ["ID"
            "User ID"
            "Product ID"
            "Subtotal"
            "Tax"
            "Total"
            "Discount"
            "Created At"
            "Quantity"
            "User → ID"
            "User → Address"
            "User → Email"
            "User → Password"
            "User → Name"
            "User → City"
            "User → Longitude"
            "User → State"
            "User → Source"
            "User → Birth Date"
            "User → Zip"
            "User → Latitude"
            "User → Created At"
            "Product → ID"
            "Product → Ean"
            "Product → Title"
            "Product → Category"
            "Product → Vendor"
            "Product → Price"
            "Product → Rating"
            "Product → Created At"]
           results))))

(deftest ^:parallel display-name-without-metadata-test
  (testing "Some display name is generated for fields even if they cannot be resolved (#33490)"
    (let [query      lib.tu/venues-query
          field-id   (inc (apply max (map :id (lib/visible-columns query))))
          field-name (str field-id)]
      (mu/disable-enforcement
        (is (=? {:name              (str field-id)
                 :display-name      field-name
                 :long-display-name (str "join → " field-name)}
                (lib/display-info query [:field {:join-alias "join"} field-id])))))))

(deftest ^:parallel visible-columns-test
  (testing "Include all visible columns, not just projected ones (#31233)"
    (is (= ["ID"
            "NAME"
            "CATEGORY_ID"
            "LATITUDE"
            "LONGITUDE"
            "PRICE"
            "Categories__ID"            ; this column is not projected, but should still be returned.
            "Categories__NAME"]
           (map :lib/desired-column-alias
                (-> lib.tu/venues-query
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Categories"))])
                                  (lib/with-join-fields [(lib/with-join-alias (meta/field-metadata :categories :name) "Categories")])))
                    lib/visible-columns)))))
  (testing "nil has no visible columns (#31366)"
    (is (empty? (-> lib.tu/venues-query
                    (lib/visible-columns nil)))))
  (testing "Include multiple implicitly joinable columns pointing to the same table and field (##33451)"
    (is (= ["id"
            "created_by"
            "updated_by"
            "ic_accounts__via__created_by__id"
            "ic_accounts__via__created_by__name"
            "ic_accounts__via__updated_by__id"
            "ic_accounts__via__updated_by__name"]
           (->> (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
                lib/visible-columns
                (map :lib/desired-column-alias)))))
  (testing "multiple aggregations"
    (lib.metadata.calculation/visible-columns
     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
         (lib/aggregate (lib/count))
         (lib/aggregate (lib/sum (meta/field-metadata :orders :quantity)))))))

(deftest ^:parallel source-cards-test
  (testing "with :source-card"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata lib.tu/metadata-provider-with-mock-cards
                 :database     (meta/id)
                 :stages       [{:lib/type :mbql.stage/mbql
                                 :source-card (:id (lib.tu/mock-cards :orders))}]}
          own-fields (for [field (lib.metadata/fields lib.tu/metadata-provider-with-mock-cards (meta/id :orders))]
                       (-> field
                           (assoc :lib/source :source/card)))]
      (testing "implicitly joinable columns"
        (testing "are included by visible-columns"
          (is (=? (->> (concat own-fields
                               (for [field (lib.metadata/fields lib.tu/metadata-provider-with-mock-cards (meta/id :people))]
                                 (assoc field :lib/source :source/implicitly-joinable))
                               (for [field (lib.metadata/fields lib.tu/metadata-provider-with-mock-cards (meta/id :products))]
                                 (assoc field :lib/source :source/implicitly-joinable)))
                       (sort-by (juxt :name :id)))
                  (sort-by (juxt :name :id) (lib.metadata.calculation/visible-columns query)))))
        (testing "are not included by returned-columns"
          (is (=? (sort-by (juxt :name :id) own-fields)
                  (sort-by (juxt :name :id) (lib.metadata.calculation/returned-columns query))))))
      (testing "multi-stage implicitly joinable columns"
        (let [own-fields (mapv #(-> %
                                    (dissoc :id :table-id)
                                    (assoc :lib/source :source/previous-stage))
                               own-fields)
              query (lib/append-stage query)]
          (testing "are included by visible-columns"
            (is (=? (->> (concat own-fields
                                 (for [field (lib.metadata/fields lib.tu/metadata-provider-with-mock-cards (meta/id :people))]
                                   (assoc field :lib/source :source/implicitly-joinable))
                                 (for [field (lib.metadata/fields lib.tu/metadata-provider-with-mock-cards (meta/id :products))]
                                   (assoc field :lib/source :source/implicitly-joinable)))
                         (sort-by (juxt :lib/source :name :id)))
                    (sort-by (juxt :lib/source :name :id) (lib.metadata.calculation/visible-columns query)))))
          (testing "are not included by returned-columns"
            (is (=? (sort-by (juxt :name :id) own-fields)
                    (sort-by (juxt :name :id) (lib.metadata.calculation/returned-columns query))))))))))

(deftest ^:parallel self-join-visible-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields (for [field [:id :tax]]
                                     (lib/ref (meta/field-metadata :orders field))))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                 [(lib/= (meta/field-metadata :orders :id)
                                                         (meta/field-metadata :orders :id))])
                                (lib/with-join-fields (for [field [:id :tax]]
                                                        (lib/ref (meta/field-metadata :orders field)))))))
        orders-cols (for [field-name ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX"
                                      "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY"]]
                      {:name field-name
                       :lib/desired-column-alias field-name
                       :lib/source :source/table-defaults})
        joined-cols (for [field-name ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX"
                                      "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY"]]
                      {:name field-name
                       :lib/desired-column-alias (str "Orders__" field-name)
                       :lib/source :source/joins})]
    (testing "just own columns"
      (is (=? (concat orders-cols joined-cols)
              (lib/visible-columns query -1 (lib.util/query-stage query -1) {:include-implicitly-joinable? false}))))
    (testing "with implicit joins"
      (is (=? (concat orders-cols
                      joined-cols
                      ;; First set of implicit joins
                      (sort-by :position
                               (for [field (meta/fields :people)]
                                 (meta/field-metadata :people field)))
                      (sort-by :position
                               (for [field (meta/fields :products)]
                                 (meta/field-metadata :products field)))
                      ;; Second set of implicit joins
                      (sort-by :position
                               (for [field (meta/fields :people)]
                                 (meta/field-metadata :people field)))
                      (sort-by :position
                               (for [field (meta/fields :products)]
                                 (meta/field-metadata :products field))))
              (lib/visible-columns query -1 (lib.util/query-stage query -1)))))))

(deftest ^:parallel visible-columns-excludes-offset-expressions-test
  (testing "visible-columns should exclude expressions which contain :offset"
    (let [query (-> lib.tu/venues-query
                    (lib/order-by (meta/field-metadata :venues :id) :asc)
                    (lib/expression "Offset col"    (lib/offset (meta/field-metadata :venues :price) -1))
                    (lib/expression "Nested Offset"
                                    (lib/* 100 (lib/offset (meta/field-metadata :venues :price) -1))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/visible-columns query)))))))

(deftest ^:parallel returned-columns-includes-offset-expressions-test
  (testing "returned-columns should include expressions which contain :offset"
    (let [query (-> lib.tu/venues-query
                    (lib/order-by (meta/field-metadata :venues :id) :asc)
                    (lib/expression "Offset col"    (lib/offset (meta/field-metadata :venues :price) -1))
                    (lib/expression "Nested Offset"
                                    (lib/* 100 (lib/offset (meta/field-metadata :venues :price) -1))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:name "Offset col",    :lib/source :source/expressions}
                 {:name "Nested Offset", :lib/source :source/expressions}]
                (lib/returned-columns query)))))))

(deftest ^:parallel implicitly-joinable-requires-numeric-id-test
  (testing "implicit join requires real field IDs, so SQL models need to provide that metadata (#37067)"
    (let [model (assoc (lib.tu/mock-cards :orders/native) :type :model)
          mp    (lib.tu/metadata-provider-with-mock-card model)
          query (lib/query mp model)]
      (testing "without FK metadata, only the own columns are returned"
        (is (= 9 (count (lib/visible-columns query))))
        (is (= []
               (->> (lib/visible-columns query)
                    (remove (comp #{:source/card} :lib/source)))))))

    (testing "metadata for the FK target field is not sufficient"
      (let [base    (lib.tu/mock-cards :orders/native)
            with-fk (for [col (:result-metadata base)]
                      (if (= (:name col) "USER_ID")
                        (assoc col :fk-target-field-id (meta/id :people :id))
                        col))
            model   (assoc base
                           :type            :model
                           :result-metadata with-fk)
            mp      (lib.tu/metadata-provider-with-mock-card model)
            query   (lib/query mp model)]
        (is (= 9 (count (lib/visible-columns query))))
        (is (= []
               (->> (lib/visible-columns query)
                    (remove (comp #{:source/card} :lib/source)))))))

    (testing "an ID for the FK field itself is not sufficient"
      (let [base    (lib.tu/mock-cards :orders/native)
            with-id (for [col (:result-metadata base)]
                      (merge col
                             (when (= (:name col) "USER_ID")
                               {:id            (meta/id :orders :user-id)
                                :semantic-type nil})))
            model   (assoc base
                           :type            :model
                           :result-metadata with-id)
            mp      (lib.tu/metadata-provider-with-mock-card model)
            query   (lib/query mp model)]
        (is (= 9 (count (lib/visible-columns query))))
        (is (= []
               (->> (lib/visible-columns query)
                    (remove (comp #{:source/card} :lib/source)))))))
    (testing "the ID and :semantic-type :type/FK are sufficient for an implicit join"
      (let [base          (lib.tu/mock-cards :orders/native)
            with-fk       (for [col (:result-metadata base)]
                            (merge col
                                   (when (= (:name col) "USER_ID")
                                     {:id            (meta/id :orders :user-id)
                                      :semantic-type :type/FK})))
            model         (assoc base
                                 :type            :model
                                 :result-metadata with-fk)
            mp            (lib.tu/metadata-provider-with-mock-card model)
            query         (lib/query mp model)
            fields-of     (fn [table-kw order-fn]
                            (->> (meta/fields table-kw)
                                 (map #(meta/field-metadata table-kw %))
                                 (sort-by order-fn)))
            orders-fields (into {} (for [[index field] (m/indexed ["ID" "SUBTOTAL" "TOTAL" "TAX" "DISCOUNT" "QUANTITY"
                                                                   "CREATED_AT" "PRODUCT_ID" "USER_ID"])]
                                     [field index]))
            orders-cols   (fields-of :orders (comp orders-fields :name))
            people-cols   (fields-of :people :position)]
        (is (= 22 (count (lib/visible-columns query))))
        (is (=? (concat (for [col orders-cols]
                          {:name       (:name col)
                           :lib/source :source/card})
                        (for [col people-cols]
                          {:name       (:name col)
                           :lib/source :source/implicitly-joinable}))
                (lib/visible-columns query)))))))

(def cols-fns [lib/visible-columns lib/filterable-columns lib/breakoutable-columns lib/orderable-columns])

(deftest ^:parallel inherited-temporal-unit-stage-propagation-test
  (let [unit :quarter
        base (-> meta/metadata-provider
                 (lib/query (meta/table-metadata :orders))
                 (lib/aggregate (lib/count)))
        stage-0-query (lib/breakout base
                                    (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) unit))
        stage-0-breakout (first (lib/breakouts stage-0-query))
        stage-0-returned-breakout-col (first (lib/returned-columns stage-0-query))
        stage-1-query (-> (lib/append-stage stage-0-query)
                          (lib/with-fields -1 [(assoc stage-0-returned-breakout-col
                                                      :lib/source :source/previous-stage)]))
        stage-2-query (lib/append-stage stage-1-query)]
    (testing "0th stage `orderable-columns` do not contain inherited-temporal-unit"
      (is ((complement contains?)
           (u/prog1 (lib/find-matching-column stage-0-breakout (lib/orderable-columns stage-0-query))
             (is (= :metadata/column (:lib/type <>))))
           :inherited-temporal-unit)))
    (testing "1st stage col function contain inherited-temporal-unit"
      (doseq [cols-fn cols-fns
              :let [stage-1-cols (cols-fn stage-1-query)
                    stage-1-col (lib/find-matching-column stage-0-breakout stage-1-cols)]]
        (is (= unit (:inherited-temporal-unit stage-1-col)))))
    (testing "inherited-temporal-unit is propagated into 2nd stage (and further)"
      (doseq [cols-fn cols-fns
              :let [stage-2-cols (cols-fn stage-2-query)
                    stage-1-ref (first (lib/fields stage-1-query))
                    stage-2-col (lib/find-matching-column stage-1-ref stage-2-cols)]]
        (is (= unit (:inherited-temporal-unit stage-2-col)))))))

(deftest ^:parallel inherited-temporal-unit-card-propagation-test
  (let [unit :quarter
        card-id 11001100
        card-query (-> meta/metadata-provider
                       (lib/query (meta/table-metadata :orders))
                       (lib/aggregate (lib/count))
                       (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) unit)))
        breakout-ref (first (lib/breakouts card-query))
        mp (lib.tu/metadata-provider-with-card-from-query card-id card-query)
        query (lib/query mp (lib.metadata/card mp card-id))]
    (testing "_cols functions_ return :inherited-temporal-unit for a card source"
      (doseq [cols-fn cols-fns]
        (is (contains? (lib/find-matching-column breakout-ref (cols-fn query))
                       :inherited-temporal-unit))))))

(deftest ^:parallel inherited-temporal-unit-propagation-from-expression-test
  (let [expression-name "created at + 1 month"
        query (as-> meta/metadata-provider $
                (lib/query $ (meta/table-metadata :orders))
                (lib/expression $
                                expression-name
                                (lib/datetime-add (meta/field-metadata :orders :created-at)
                                                  1 :month))
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (lib/with-temporal-bucket
                                  (lib/expression-ref $ 0 expression-name)
                                  :quarter))
                (lib/append-stage $))]
    (testing "_cols functions_ return :inherited-temporla-unit for bucketed expressions"
      (doseq [cols-fn cols-fns]
        (is (= :quarter (-> (lib/expression-ref query 0 expression-name)
                            (lib/find-matching-column (cols-fn query))
                            :inherited-temporal-unit)))))
    (testing "orderable columns do not contain inherited-temporal-unit for expression"
      (is (not (contains? (lib/find-matching-column (lib/expression-ref query 0 expression-name)
                                                    (lib/orderable-columns query 0))
                          :inherited-temporal-unit))))))
