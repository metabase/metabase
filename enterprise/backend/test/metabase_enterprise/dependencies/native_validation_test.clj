(ns metabase-enterprise.dependencies.native-validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.native-validation :as deps.native-validation]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]))

(defn- fake-query
  ([mp query]
   (fake-query mp query {}))
  ([mp query template-tags]
   (-> (lib/native-query mp query)
       (lib/with-template-tags template-tags))))

(defn- normalize-error
  "Normalize error :name using driver conventions for comparison.
   This matches what sql-tools/common.clj does when returning errors."
  [driver error]
  (if-let [error-name (:name error)]
    (assoc error :name (driver.sql/normalize-name driver error-name))
    error))

(defn- normalize-error-names
  "Normalize :name values in validation errors using driver conventions.
   Both SQLGlot and Macaw errors are normalized by sql-tools/common.clj,
   so we need to normalize expected values to match."
  [driver errors]
  (into #{}
        (map (partial normalize-error driver))
        errors))

(defn- normalize-result-metadata
  "Lowercase :name and :lib/desired-column-alias values in result metadata for case-insensitive comparison.
  SQLGlot returns lowercase column names while Macaw preserves query case."
  [results]
  (mapv (fn [col]
          (cond-> col
            (:name col) (update :name u/lower-case-en)
            (:lib/desired-column-alias col) (update :lib/desired-column-alias u/lower-case-en)))
        results))

(defn- validates?
  [mp driver card-id expected]
  (is (=? (if (set? expected) (normalize-error-names driver expected) expected)
          (deps.native-validation/validate-native-query
           driver
           (-> (lib.metadata/card mp card-id)
               :dataset-query
               (assoc :lib/metadata mp))))))

(deftest ^:parallel basic-deps-test
  (let [mp     (deps.tu/default-metadata-provider)
        driver (:engine (lib.metadata/database mp))]
    (is (= #{{:table (meta/id :products)}} ; how is a driver supposed to work out the ID of the table??
           (->> (lib.metadata/card mp 4)
                :dataset-query
                (lib-be/normalize-query mp)
                (deps.native-validation/native-query-deps driver))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}}
           (->> (lib.metadata/card mp 5)
                :dataset-query
                (lib-be/normalize-query mp)
                (deps.native-validation/native-query-deps driver))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}}
           (->> (lib.metadata/card mp 6)
                :dataset-query
                (lib-be/normalize-query mp)
                (deps.native-validation/native-query-deps driver))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}
             {:snippet 2}}
           (->> (lib.metadata/card mp 7)
                :dataset-query
                (lib-be/normalize-query mp)
                (deps.native-validation/native-query-deps driver))))
    (is (= #{{:table (meta/id :products)}
             {:table (meta/id :orders)}
             {:card 1}
             {:card 2}}
           (->> (lib.metadata/card mp 9)
                :dataset-query
                (lib-be/normalize-query mp)
                (deps.native-validation/native-query-deps driver))))))

(deftest ^:parallel validate-bad-queries-test
  (testing "validate-native-query handles nonsense queries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "complete nonsense query"
        ;; SQLGlot is more permissive than jsqlparser and may not catch all nonsense queries.
        ;; Check that result is either a syntax error or empty (permissive parse).
        (let [result (deps.native-validation/validate-native-query
                      driver
                      (fake-query mp "this is not a query"))]
          (is (or (= #{(lib/syntax-error)} result)
                  (= #{} result))
              (str "Expected syntax-error or empty set, got: " result))))
      (testing "bad table wildcard"
        ;; Normalize expected value using driver conventions (H2 uppercases, Postgres lowercases)
        (is (= (normalize-error-names driver #{(lib/missing-table-alias-error "products")})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select products.* from orders")))))
      (testing "bad col reference"
        ;; Normalize expected value using driver conventions (H2 uppercases, Postgres lowercases)
        (is (= (normalize-error-names driver #{(lib/missing-column-error "bad")})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select bad from products"))))))))

(deftest ^:parallel validate-table-function-query-test
  (testing "can validate queries using table functions"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (= #{}
             (deps.native-validation/validate-native-query
              driver
              (fake-query mp "select i from my_function(1, 100)")))))))

(deftest ^:parallel validate-native-query-with-subquery-columns-test
  (testing "validate-native-query should detect invalid columns in subqueries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]

      (testing "Valid query - selecting existing columns from subquery"
        (validates? mp driver 10 empty?))
      (testing "Invalid query - selecting non-existent column from subquery"
        (validates? mp driver 11 #{(lib/missing-column-error "CATEGORY")})
        (validates? mp driver 12 #{(lib/missing-column-error "CATEGORY")}))
      (testing "Nested subqueries"
        (validates? mp driver 13 empty?)
        (validates? mp driver 14 #{(lib/missing-column-error "CATEGORY")}))
      (testing "SELECT * from subquery expands to subquery columns"
        (validates? mp driver 15 empty?)
        (validates? mp driver 16 empty?)
        (validates? mp driver 17 #{(lib/missing-column-error "EMAIL")})))))

(deftest ^:parallel validate-card-reference-after-expansion-test
  (testing "Validation of queries after card references have been expanded"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Card reference expanded to subquery - valid columns"
        (validates? mp driver 18 empty?))
      (testing "Card reference expanded to subquery - invalid column"
        (validates? mp driver 19
                    #{(lib/missing-column-error "DESCRIPTION")}))
      (testing "Card reference with alias - valid column"
        (validates? mp driver 20 empty?))
      (testing "Card reference with alias - invalid column"
        (validates? mp driver 21
                    #{(lib/missing-column-error "PASSWORD")}))
      (testing "Wildcard selection from card reference"
        (validates? mp driver 22 empty?))
      (testing "Invalid column from aliased card"
        (validates? mp driver 23
                    #{(lib/missing-column-error "LATITUDE")})))))

(defn- check-result-metadata [driver mp query expected]
  (is (=? (normalize-result-metadata expected)
          (->> query
               (fake-query mp)
               (deps.native-validation/native-result-metadata driver)
               normalize-result-metadata))))

(defn- add-desired-column-alias [fields]
  (map #(assoc % :lib/desired-column-alias (:name %)) fields))

(deftest ^:parallel result-metadata-test
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
      (testing "Selecting a union of custom fields"
        (check-result-metadata
         driver mp
         "select 1 as TOTAL union select 2"
         [{:name "TOTAL",
           :lib/desired-column-alias "TOTAL",
           :display-name "Total",
           :base-type :type/*,
           :effective-type :type/*,
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
      (testing "Using a table function"
        (check-result-metadata
         driver mp
         "select ids from my_function(1, 100)"
         [{:name "IDS",
           :lib/desired-column-alias "IDS",
           :display-name "Ids",
           :effective-type :type/*,
           :semantic-type :Semantic/*}]))
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
