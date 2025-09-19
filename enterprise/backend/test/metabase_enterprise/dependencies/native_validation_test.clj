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
  (is (= expected
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

(deftest validate-bad-query-test
  (testing "validate-native-query handles nonsense queries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (not (deps.native-validation/validate-native-query
                driver mp
                (fake-query mp "this is not a query")))))))

(deftest validate-native-query-with-subquery-columns-test
  (testing "validate-native-query should detect invalid columns in subqueries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]

      (testing "Valid query - selecting existing columns from subquery"
        (validates? mp driver 10 true))

      (testing "Invalid query - selecting non-existent column from subquery"
        (validates? mp driver 11 false)
        (validates? mp driver 12 false))

      (testing "Nested subqueries"
        (validates? mp driver 13 true)
        (validates? mp driver 14 false))

      (testing "SELECT * from subquery expands to subquery columns"
        (validates? mp driver 15 true)
        (validates? mp driver 16 true)
        (validates? mp driver 17 false)))))

(deftest validate-card-reference-after-expansion-test
  (testing "Validation of queries after card references have been expanded"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]

      (testing "Card reference expanded to subquery - valid columns"
        (validates? mp driver 18 true))

      (testing "Card reference expanded to subquery - invalid column"
        (validates? mp driver 19 false))

      (testing "Card reference with alias - valid column"
        (validates? mp driver 20 true))

      (testing "Card reference with alias - invalid column"
        (validates? mp driver 21 false))

      (testing "Wildcard selection from card reference"
        (validates? mp driver 22 true))

      (testing "Invalid column from aliased card"
        (validates? mp driver 23 false)))))

(defn- check-result-metadata [driver mp query expected]
  (is (=? expected
          (->> query
               (fake-query mp)
               (deps.native-validation/native-result-metadata driver mp)))))

(deftest result-metadata-test
  (testing "Calculates result metadata"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Selecting a wildcard"
        (check-result-metadata
         driver mp
         "select * from orders"
         (lib.metadata/fields mp (meta/id :orders))))
      (testing "Selecting a table wildcard"
        (check-result-metadata
         driver mp
         "select orders.* from orders"
         (lib.metadata/fields mp (meta/id :orders))))
      (testing "Selecting a single col"
        (check-result-metadata
         driver mp
         "select total from orders"
         [(lib.metadata/field mp (meta/id :orders :total))]))
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
           :display-name "Total",
           :base-type :type/Float,
           :effective-type :type/Float,
           :semantic-type :Semantic/*}]))
      (testing "Selecting a union with different types"
        (check-result-metadata
         driver mp
         "select category from products union select title from products"
         [{:name "CATEGORY",
           :display-name "Category",
           :base-type :type/Text,
           :effective-type :type/Text,
           :semantic-type :type/Category}])))))
