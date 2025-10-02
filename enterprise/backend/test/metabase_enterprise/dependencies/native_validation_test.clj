(ns metabase-enterprise.dependencies.native-validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.native-validation :as deps.native-validation]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(defn- fake-query
  ([mp query]
   (fake-query mp query {}))
  ([mp query template-tags]
   {:database (:id (lib.metadata/database mp))
    :type     :native
    :native   {:query query
               :template-tags template-tags}}))

(defn- validates?
  [mp driver card-id expected]
  (is (=? expected
          (->> (lib.metadata/card mp card-id)
               :dataset-query
               (deps.native-validation/validate-native-query driver mp)))))

(deftest basic-deps-test
  (let [mp     (deps.tu/default-metadata-provider)
        driver (:engine (lib.metadata/database mp))]
    (is (= #{{:table (meta/id :products)}}
           (->> (lib.metadata/card mp 4)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}}
           (->> (lib.metadata/card mp 5)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}}
           (->> (lib.metadata/card mp 6)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}
             {:snippet 2}}
           (->> (lib.metadata/card mp 7)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:table (meta/id :orders)}
             {:card 1}
             {:card 2}}
           (->> (lib.metadata/card mp 9)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))))

(deftest validate-bad-queries-test
  (testing "validate-native-query handles nonsense queries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "complete nonsense query"
        (is (= [{:error :bad-sql}]
               (deps.native-validation/validate-native-query
                driver mp
                (fake-query mp "this is not a query")))))
      (testing "bad table wildcard"
        (is (= [{:type :invalid-table-wildcard,
                 :table "products",
                 :metabase.driver.sql/bad-reference true}]
               (deps.native-validation/validate-native-query
                driver mp
                (fake-query mp "select products.* from orders")))))
      (testing "bad col reference"
        (is (= [{:column "BAD",
                 :alias nil,
                 :type :single-column,
                 :source-columns [[{:type :all-columns, :table {:table "PRODUCTS"}}]],
                 :metabase.driver.sql/bad-reference true}]
               (deps.native-validation/validate-native-query
                driver mp
                (fake-query mp "select bad from products"))))))))

(deftest validate-native-query-with-subquery-columns-test
  (testing "validate-native-query should detect invalid columns in subqueries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]

      (testing "Valid query - selecting existing columns from subquery"
        (validates? mp driver 10 empty?))

      (testing "Invalid query - selecting non-existent column from subquery"
        (validates? mp driver 11 [{:column "CATEGORY",
                                   :alias nil,
                                   :type :single-column,
                                   :source-columns [[]],
                                   :metabase.driver.sql/bad-reference true}])
        (validates? mp driver 12 [{:column "CATEGORY",
                                   :alias nil,
                                   :type :single-column,
                                   :source-columns [[]],
                                   :metabase.driver.sql/bad-reference true}]))

      (testing "Nested subqueries"
        (validates? mp driver 13 empty?)
        (validates? mp driver 14 [{:column "CATEGORY",
                                   :alias nil,
                                   :type :single-column,
                                   :source-columns [[]],
                                   :metabase.driver.sql/bad-reference true}]))

      (testing "SELECT * from subquery expands to subquery columns"
        (validates? mp driver 15 empty?)
        (validates? mp driver 16 empty?)
        (validates? mp driver 17 [{:column "EMAIL",
                                   :alias nil,
                                   :type :single-column,
                                   :source-columns [[]],
                                   :metabase.driver.sql/bad-reference true}])))))

(deftest validate-card-reference-after-expansion-test
  (testing "Validation of queries after card references have been expanded"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]

      (testing "Card reference expanded to subquery - valid columns"
        (validates? mp driver 18 empty?))

      (testing "Card reference expanded to subquery - invalid column"
        (validates? mp driver 19
                    [{:column "DESCRIPTION",
                      :alias nil,
                      :type :single-column,
                      :source-columns [[]],
                      :metabase.driver.sql/bad-reference true}]))

      (testing "Card reference with alias - valid column"
        (validates? mp driver 20 empty?))

      (testing "Card reference with alias - invalid column"
        (validates? mp driver 21
                    [{:column "PASSWORD",
                      :alias nil,
                      :type :single-column,
                      :source-columns [[]],
                      :metabase.driver.sql/bad-reference true}]))

      (testing "Wildcard selection from card reference"
        (validates? mp driver 22 empty?))

      (testing "Invalid column from aliased card"
        (validates? mp driver 23
                    [{:column "LATITUDE",
                      :alias nil,
                      :type :single-column,
                      :source-columns [[]],
                      :metabase.driver.sql/bad-reference true}])))))

(defn- check-result-metadata [driver mp query expected]
  (is (=? expected
          (->> query
               (fake-query mp)
               (deps.native-validation/native-result-metadata driver mp)))))

(defn- add-desired-column-alias [fields]
  (map #(assoc % :lib/desired-column-alias (:name %)) fields))

(deftest result-metadata-test
  (testing "Calculates result metadata"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Selecting a wildcard"
        (check-result-metadata
         driver mp
         "select * from orders"
         (add-desired-column-alias (lib.metadata/fields mp (meta/id :orders)))))
      (testing "Selecting a table wildcard"
        (check-result-metadata
         driver mp
         "select orders.* from orders"
         (add-desired-column-alias (lib.metadata/fields mp (meta/id :orders)))))
      (testing "Selecting a single col"
        (check-result-metadata
         driver mp
         "select total from orders"
         (add-desired-column-alias [(lib.metadata/field mp (meta/id :orders :total))])))
      (testing "Selecting a nonexistent col"
        (check-result-metadata
         driver mp
         "select bad from orders"
         []))
      (testing "Selecting a col with an alias"
        (check-result-metadata
         driver mp
         "select subtotal as new_subtotal from orders"
         [{:lib/type :metadata/column,
           :base-type :type/Float,
           :semantic-type nil,
           :name "SUBTOTAL",
           :lib/desired-column-alias "NEW_SUBTOTAL"
           :database-type "DOUBLE PRECISION",
           :display-name "Subtotal"}]))
      (testing "Selecting a custom col"
        (check-result-metadata
         driver mp
         "select subtotal + tax as sum from orders"
         [{:base-type :type/*,
           :name "SUM",
           :display-name "Sum",
           :effective-type :type/*,
           :semantic-type :Semantic/*}]))
      (testing "Selecting a union"
        (check-result-metadata
         driver mp
         "select total from orders union select subtotal from orders"
         [{:name "TOTAL",
           :lib/desired-column-alias "TOTAL",
           :display-name "Total",
           :base-type :type/Float,
           :effective-type :type/Float,
           :semantic-type :Semantic/*}]))
      (testing "Selecting a union with different types"
        (check-result-metadata
         driver mp
         "select category from products union select title from products"
         [{:name "CATEGORY",
           :lib/desired-column-alias "CATEGORY",
           :display-name "Category",
           :base-type :type/Text,
           :effective-type :type/Text,
           :semantic-type :type/Category}]))
      (testing "Selecting a bad table wildcard"
        (check-result-metadata
         driver mp
         "select orders.* from products"
         []))
      (testing "Using a nonsense query"
        (check-result-metadata
         driver mp
         "this is not a query"
         [])))))
