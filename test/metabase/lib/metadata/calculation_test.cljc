(ns metabase.lib.metadata.calculation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
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
