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
   [metabase.lib.test-util :as lib.tu]
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
        (let [result (deps.native-validation/validate-native-query
                      driver
                      (fake-query mp "this is not a query!!!"))]
          (is (= #{(lib/syntax-error)} result)
              (str "Expected syntax-error or empty set, got: " result))))
      (testing "bad table wildcard"
        ;; missing-table-alias errors don't get source attribution — the alias itself is unresolved
        (is (= (normalize-error-names driver
                                      #{(lib/missing-table-alias-error "products")})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select products.* from orders")))))
      (testing "bad col reference"
        ;; Normalize expected value using driver conventions (H2 uppercases, Postgres lowercases)
        (is (= (normalize-error-names driver
                                      #{(merge (lib/missing-column-error "bad")
                                               {:source-entity-type :table
                                                :source-entity-id   (meta/id :products)})})
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
        (validates? mp driver 11 #{(merge (lib/missing-column-error "CATEGORY")
                                          {:source-entity-type :table
                                           :source-entity-id   (meta/id :people)})})
        (validates? mp driver 12 #{(merge (lib/missing-column-error "CATEGORY")
                                          {:source-entity-type :table
                                           :source-entity-id   (meta/id :people)})}))
      (testing "Nested subqueries"
        (validates? mp driver 13 empty?)
        (validates? mp driver 14 #{(merge (lib/missing-column-error "CATEGORY")
                                          {:source-entity-type :table
                                           :source-entity-id   (meta/id :people)})}))
      (testing "SELECT * from subquery expands to subquery columns"
        (validates? mp driver 15 empty?)
        (validates? mp driver 16 empty?)
        (validates? mp driver 17 #{(merge (lib/missing-column-error "EMAIL")
                                          {:source-entity-type :table
                                           :source-entity-id   (meta/id :people)})})))))

(deftest ^:parallel validate-card-reference-after-expansion-test
  (testing "Validation of queries after card references have been expanded"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Card reference expanded to subquery - valid columns"
        (validates? mp driver 18 empty?))
      (testing "Card reference expanded to subquery - invalid column"
        (validates? mp driver 19
                    #{(merge (lib/missing-column-error "DESCRIPTION")
                             {:source-entity-type :card
                              :source-entity-id   1})}))
      (testing "Card reference with alias - valid column"
        (validates? mp driver 20 empty?))
      (testing "Card reference with alias - invalid column"
        (validates? mp driver 21
                    #{(merge (lib/missing-column-error "PASSWORD")
                             {:source-entity-type :card
                              :source-entity-id   1})}))
      (testing "Wildcard selection from card reference"
        (validates? mp driver 22 empty?))
      (testing "Invalid column from aliased card"
        (validates? mp driver 23
                    #{(merge (lib/missing-column-error "LATITUDE")
                             {:source-entity-type :card
                              :source-entity-id   1})})))))

(deftest ^:parallel validate-card-reference-multi-card-test
  (testing "Source attribution with multiple card references"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Multi-card query, unqualified - source is unknown"
        (validates? mp driver 24
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :unknown})}))
      (testing "Multi-card query, qualified - source attributed to specific card"
        (validates? mp driver 25
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :card
                              :source-entity-id   1})})))))

(deftest ^:parallel validate-card-reference-mixed-table-card-test
  (testing "Source attribution with mixed table and card references"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Mixed table+card, unqualified - source is unknown"
        (validates? mp driver 26
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :unknown})}))
      (testing "Mixed table+card, qualified to table - source attributed to table"
        (validates? mp driver 27
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :table
                              :source-entity-id   (meta/id :products)})}))
      (testing "Mixed table+card, missing column + unknown alias"
        (validates? mp driver 28
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :table
                              :source-entity-id   (meta/id :products)})
                      (lib/missing-table-alias-error "xix")})))))

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

(deftest ^:parallel validate-native-query-source-attribution-test
  (testing "errors include source entity info for table-only queries"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "single table query - error attributed to that table"
        (is (= (normalize-error-names driver
                                      #{{:type               :missing-column
                                         :name               "bad"
                                         :source-entity-type :table
                                         :source-entity-id   (meta/id :products)}})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select bad from products")))))
      (testing "multi-table query, unqualified - source is unknown"
        (is (= (normalize-error-names driver
                                      #{{:type               :missing-column
                                         :name               "bad"
                                         :source-entity-type :unknown}})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select bad from products join orders on products.id = orders.product_id")))))
      (testing "multi-table query, qualified - source attributed to specific table"
        (is (= (normalize-error-names driver
                                      #{{:type               :missing-column
                                         :name               "bad"
                                         :source-entity-type :table
                                         :source-entity-id   (meta/id :products)}})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select products.bad from products join orders on products.id = orders.product_id")))))
      (testing "multi-table query, qualified with alias - source attributed to specific table"
        (is (= (normalize-error-names driver
                                      #{{:type               :missing-column
                                         :name               "bad"
                                         :source-entity-type :table
                                         :source-entity-id   (meta/id :products)}})
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select p.bad from products p join orders o on p.id = o.product_id")))))
      (testing "no errors - returns empty set"
        (is (= #{}
               (deps.native-validation/validate-native-query
                driver
                (fake-query mp "select * from products"))))))))

(deftest ^:parallel fallback-single-table-cte-test
  (testing "CTE with single table - fallback attributes missing column to that table"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (= (normalize-error-names driver
                                    #{{:type               :missing-column
                                       :name               "bad"
                                       :source-entity-type :table
                                       :source-entity-id   (meta/id :products)}})
             (deps.native-validation/validate-native-query
              driver
              (fake-query mp "WITH cte AS (SELECT id, title FROM products) SELECT bad FROM cte")))))))

(deftest ^:parallel fallback-multi-table-cte-test
  (testing "CTE with multiple tables - fallback produces :unknown source"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (= (normalize-error-names driver
                                    #{{:type               :missing-column
                                       :name               "bad"
                                       :source-entity-type :unknown}})
             (deps.native-validation/validate-native-query
              driver
              (fake-query mp "WITH cte AS (SELECT p.id, o.total FROM products p JOIN orders o ON p.id = o.product_id) SELECT bad FROM cte")))))))

(deftest ^:parallel fallback-zero-tables-test
  (testing "CTE with no real table references - error has no source attribution"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (= (normalize-error-names driver
                                    #{{:type :missing-column
                                       :name "bad"}})
             (deps.native-validation/validate-native-query
              driver
              (fake-query mp "WITH cte AS (SELECT 1 AS id) SELECT bad FROM cte")))))))

(deftest ^:parallel card-source-attribution-test
  (testing "errors are attributed to the correct card"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "mixed table+card, qualified to card - attributed to card"
        (validates? mp driver 30
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :card
                              :source-entity-id   1})}))
      (testing "multi-card, qualified to second card - attributed to card 2"
        (validates? mp driver 31
                    #{(merge (lib/missing-column-error "BAD")
                             {:source-entity-type :card
                              :source-entity-id   2})})))))

(deftest ^:parallel transitive-card-chain-test
  (testing "Transitive card chain: c33 -> c32 -> c1, where c32's result-metadata lost CATEGORY"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (is (nil? (some #{"CATEGORY"} (map :name (:result-metadata (lib.metadata/card mp 32)))))
          "Card 32 should not have CATEGORY in its result-metadata")
      (validates? mp driver 33
                  #{(merge (lib/missing-column-error "CATEGORY")
                           {:source-entity-type :card
                            :source-entity-id   32})}))))

(deftest ^:parallel cross-reference-mbql-and-native-cards-test
  (testing "Native query referencing an MBQL card"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "error attributed to MBQL card"
        (validates? mp driver 35
                    #{(merge (lib/missing-column-error "CATEGORY")
                             {:source-entity-type :card
                              :source-entity-id   34})}))
      (testing "mixed MBQL + native card refs - errors attributed to correct cards"
        (validates? mp driver 37
                    #{(merge (lib/missing-column-error "CATEGORY")
                             {:source-entity-type :card
                              :source-entity-id   34})
                      (merge (lib/missing-column-error "BAD")
                             {:source-entity-type :card
                              :source-entity-id   36})})))))

(deftest ^:parallel card-with-special-char-column-test
  (testing "Card reference where card has special characters in column names"
    (let [base-mp (deps.tu/mock-metadata-provider {:snippets []})
          driver  (:engine (lib.metadata/database base-mp))
          card    (deps.tu/mock-card base-mp
                                     {:id      100
                                      :query   "SELECT 1"
                                      :details {:result-metadata [{:name "FIRST NAME" :base-type :type/Text}
                                                                  {:name "ORDER-ID"   :base-type :type/Integer}
                                                                  {:name "NORMAL"     :base-type :type/Text}]}})
          mp      (deps.tu/mock-metadata-provider {:cards [card] :snippets []})
          mkquery (fn [sql]
                    (let [ttags (lib/extract-template-tags mp sql)]
                      (fake-query mp sql ttags)))]
      (testing "valid column produces no errors"
        (is (= #{}
               (deps.native-validation/validate-native-query
                driver
                (mkquery "SELECT NORMAL FROM {{#100}}")))))
      (testing "invalid column produces error attributed to card"
        (is (= (normalize-error-names driver
                                      #{(merge (lib/missing-column-error "BAD")
                                               {:source-entity-type :card
                                                :source-entity-id   100})})
               (deps.native-validation/validate-native-query
                driver
                (mkquery "SELECT BAD FROM {{#100}}"))))))))

(deftest ^:parallel placeholder-collision-test
  (testing "When SQL contains the placeholder prefix as a real table, validation runs without source attribution"
    (let [mp     (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))
          ttags  (lib/extract-template-tags mp "SELECT BAD FROM {{#1}}")
          query  (fake-query mp
                             "SELECT BAD FROM mb__validat_card__99 JOIN {{#1}}"
                             ttags)]
      (is (= (normalize-error-names driver
                                    #{(lib/missing-column-error "BAD")})
             (deps.native-validation/validate-native-query driver query))))))

(deftest ^:parallel placeholder-no-card-refs-test
  (testing "Queries with tables named as placeholder produce expected validation results"
    (let [mp     (lib.tu/mock-metadata-provider
                  {:database {:id 100 :engine :h2}
                   :tables   [{:name   "MB__VALIDAT_CARD__10330"
                               :schema "PUBLIC"
                               :id     333
                               :db-id  1}]
                   :fields   [{:table-id  333
                               :name      "ID"
                               :base-type :type/Integer}]})
          driver (:engine (lib.metadata/database mp))]
      (testing "Selection of column present in placeholder named table returns no error"
        (let [query  (fake-query mp
                                 "SELECT ID FROM MB__VALIDAT_CARD__10330")]
          (is (= #{}
                 (deps.native-validation/validate-native-query driver query)))))
      (testing "Selection of column missing from placeholder named table returns an error with source"
        (let [query  (fake-query mp
                                 "SELECT BAD FROM MB__VALIDAT_CARD__10330")]
          (is (= (normalize-error-names driver
                                        #{(merge (lib/missing-column-error "BAD")
                                                 {:source-entity-type :table
                                                  :source-entity-id 333})})
                 (deps.native-validation/validate-native-query driver query))))))))

(deftest ^:parallel select-from-non-existent-card-test
  (let [mp     (deps.tu/default-metadata-provider)
        driver (:engine (lib.metadata/database mp))]
    (testing "Select from non-existent card produces an error"
      (let [query  (fake-query mp
                               "SELECT ID FROM {{#1234-missing-card}}")]
        (is (= (normalize-error-names driver
                                      #{(merge (lib/missing-column-error "ID")
                                               {:source-entity-type :card
                                                :source-entity-id 1234})})
               (deps.native-validation/validate-native-query driver query)))))))
