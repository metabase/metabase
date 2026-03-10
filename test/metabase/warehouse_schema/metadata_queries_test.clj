(ns metabase.warehouse-schema.metadata-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.warehouse-schema.metadata-queries :as metadata-queries]))

(defn- sort-by-field-id [clauses]
  (sort-by #(lib.util.match/match-lite %
              [:field _opts (id :guard pos-int?)]
              id)
           clauses))

(defn- id
  ([table]
   (case table
     :product 1
     :buyer   2
     :order   3))
  ([table field]
   (case table
     :product (case field
                :id   1
                :name 2)
     :buyer   (case field
                :id 3)
     :order   (case field
                :id         4
                :buyer-id   5
                :product-id 6))))

(defn- mp []
  (lib.tu/mock-metadata-provider
   {:database (assoc meta/database :id 1)
    :tables   [(assoc (meta/table-metadata :products) :name "PRODUCT", :db-id 1, :id (id :product))
               (assoc (meta/table-metadata :products) :name "BUYER", :db-id 1, :id (id :buyer), :database-require-filter true)
               (assoc (meta/table-metadata :products) :name "ORDER", :db-id 1, :id (id :order), :database-require-filter true)]
    :fields   [;; PRODUCT
               (merge (meta/field-metadata :products :id)
                      {:table-id (id :product), :name "ID", :id (id :product :id)})
               (merge (meta/field-metadata :products :id)
                      {:table-id (id :product), :name "NAME", :id (id :product :name), :base-type :type/Text})
               ;; BUYER
               (merge (meta/field-metadata :products :id)
                      {:table-id (id :buyer), :name "ID", :id (id :buyer :id), :database-partitioned true})
               ;; ORDER
               (merge (meta/field-metadata :products :id)
                      {:table-id (id :order), :name "ID", :id (id :order :id)})
               (merge (meta/field-metadata :products :id)
                      {:table-id           (id :order)
                       :name               "BUYER_ID"
                       :id                 (id :order :buyer-id)
                       :semantic-type      :type/FK
                       :fk-target-field-id (id :buyer :id)})
               (merge (meta/field-metadata :products :id)
                      {:table-id             (id :order)
                       :name                 "PRODUCT_ID"
                       :id                   (id :order :product-id)
                       :semantic-type        :type/FK
                       :fk-target-field-id   (id :product :id)
                       :database-partitioned true})]}))

(deftest ^:parallel add-required-filter-if-needed-test
  (let [mp (mp)]
    (testing "no op for tables that do not require filter"
      (let [query (lib/query mp (lib.metadata/table mp (id :product)))]
        (is (= query
               (metadata-queries/add-required-filters-if-needed query)))))))

(deftest ^:parallel add-required-filter-if-needed-test-2
  (let [mp (mp)]
    (testing "if the source table requires a filter, add the partitioned filter"
      (let [query (lib/query mp (lib.metadata/table mp (id :order)))]
        (is (=? [[:> {}
                  [:field {} (id :order :product-id)]
                  -9223372036854775808]]
                (-> (metadata-queries/add-required-filters-if-needed query)
                    :stages
                    first
                    :filters)))))))

(deftest ^:parallel add-required-filter-if-needed-test-3
  (let [mp (mp)]
    (testing "if a joined table require a filter, add the partitioned filter"
      (let [query (-> (lib/query mp (lib.metadata/table mp (id :product)))
                      (lib/join (lib.metadata/table mp (id :order))))]
        (is (=? [[:> {}
                  [:field {:join-alias string?} (id :order :product-id)]
                  -9223372036854775808]]
                (-> (metadata-queries/add-required-filters-if-needed query)
                    :stages
                    first
                    :filters)))))))

(deftest ^:parallel add-required-filter-if-needed-test-4
  (let [mp (mp)]
    (testing "if both source tables and joined table require a filter, add both"
      (let [query (-> (lib/query mp (lib.metadata/table mp (id :order)))
                      (lib/join (lib.metadata/table mp (id :buyer))))]
        (is (=? [[:> {}
                  [:field  {:join-alias string?} (id :buyer :id)]
                  -9223372036854775808]
                 [:> {}
                  [:field {} (id :order :product-id)]
                  -9223372036854775808]]
                (-> query
                    metadata-queries/add-required-filters-if-needed
                    :stages
                    first
                    :filters
                    sort-by-field-id)))))))

(deftest ^:parallel add-required-filter-if-needed-test-5
  (let [mp (mp)]
    (testing "Should add an and clause for existing filter"
      (let [query (-> (lib/query mp (lib.metadata/table mp (id :order)))
                      (lib/filter (lib/> (lib.metadata/field mp (id :order :id)) 1)))]
        (is (=? [[:> {}
                  [:field {} (id :order :id)]
                  1]
                 [:> {}
                  [:field {} (id :order :product-id)]
                  -9223372036854775808]]
                (-> query
                    metadata-queries/add-required-filters-if-needed
                    :stages
                    first
                    :filters
                    sort-by-field-id)))))))
