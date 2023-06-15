(ns metabase.lib.metadata.calculation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel calculate-names-even-without-metadata-test
  (testing "Even if metadata is missing, we should still be able to calculate reasonable display names"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/order-by [:field
                                   {:lib/uuid  (str (random-uuid))
                                    :base-type :type/Text}
                                   "TOTAL"]))]
      (is (= "Venues, Sorted by Total ascending"
             (lib.metadata.calculation/suggested-name query))))))

(deftest ^:parallel long-display-name-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
        results (->> query
                     lib.metadata.calculation/visible-columns
                     (map (comp :long-display-name #(lib/display-info query 0 %))))]
    (is (= ["ID" "Name" "Category ID" "Latitude" "Longitude" "Price" "Category → ID" "Category → Name"]
           results)))

  (let [query (lib/query-for-table-name meta/metadata-provider "ORDERS")
        results (->> query
                     lib.metadata.calculation/visible-columns
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
                (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (lib/field "VENUES" "CATEGORY_ID")
                                     (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Categories"))])
                                  (lib/with-join-fields [(lib/with-join-alias (lib/field "CATEGORIES" "NAME") "Categories")])))
                    lib.metadata.calculation/visible-columns)))))
  (testing "nil has no visible columns (#31366)"
    (is (empty? (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib.metadata.calculation/visible-columns nil))))))
