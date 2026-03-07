(ns metabase-enterprise.replacement.source-swap.native-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.source-swap.native :as source-swap.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defn- field-id-ref
  [mp field-id]
  (lib/ref (lib.metadata/field mp field-id)))

(defn- metadata-provider-with-cards []
  (lib.tu/mock-metadata-provider meta/metadata-provider
                                 {:cards [{:id 1 :name "Card 1" :database-id (meta/id)}
                                          {:id 2 :name "Card 2" :database-id (meta/id)}
                                          {:id 3 :name "Card 3" :database-id (meta/id)}]}))

;;; ----------------------------------------- swap-card-in-native-query (pure) ------------------------------------------

(deftest swap-card-in-native-query-basic-test
  (let [mp (metadata-provider-with-cards)]
    (testing "Simple card tag replacement"
      (let [query  (-> (lib/native-query mp "SELECT * FROM {{#1}}")
                       (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM {{#2}}"
               (lib/raw-native-query result)))
        (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))))

    (testing "Multiple card tags, only matching one is replaced"
      (let [query  (-> (lib/native-query mp "SELECT * FROM {{#1}} JOIN {{#3}} ON 1=1")
                       (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}
                                                "#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM {{#2}} JOIN {{#3}} ON 1=1"
               (lib/raw-native-query result)))
        (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))
        (is (= 3 (get-in (lib/template-tags result) ["#3" :card-id])))))))

(deftest swap-card-in-native-query-with-field-filters-test
  (testing "Card tag with field filter tags present"
    (let [mp     (metadata-provider-with-cards)
          query  (-> (lib/native-query mp "SELECT * FROM {{#1}} WHERE {{created_at}}")
                     (lib/with-template-tags {"#1"         {:type :card :card-id 1 :name "#1" :display-name "#1"}
                                              "created_at" {:type :dimension :name "created_at" :display-name "Created At" :widget-type :date/single}}))
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (= "SELECT * FROM {{#2}} WHERE {{created_at}}"
             (lib/raw-native-query result)))
      (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))
      (is (= "created_at"
             (get-in (lib/template-tags result) ["created_at" :name]))))))

(deftest swap-card-in-native-query-with-optional-clauses-test
  (let [mp (metadata-provider-with-cards)]
    (testing "Card tag with optional clause containing field filter"
      (let [query  (-> (lib/native-query mp "SELECT * FROM {{#1}} [[WHERE {{created_at}}]]")
                       (lib/with-template-tags {"#1"         {:type :card :card-id 1 :name "#1" :display-name "#1"}
                                                "created_at" {:type :dimension :name "created_at" :display-name "Created At" :widget-type :date/single}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM {{#2}} [[WHERE {{created_at}}]]"
               (lib/raw-native-query result)))
        (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))))

    (testing "Card tag inside optional clause"
      (let [query  (-> (lib/native-query mp "SELECT * FROM foo [[JOIN {{#1}} ON 1=1]]")
                       (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM foo [[JOIN {{#2}} ON 1=1]]"
               (lib/raw-native-query result)))
        (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))))))

(deftest swap-card-in-native-query-comment-test
  (let [mp (metadata-provider-with-cards)]
    (testing "Card tag inside a line comment should NOT be replaced"
      (let [query  (-> (lib/native-query mp "SELECT * FROM {{#1}}\n-- old: {{#1}}")
                       (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM {{#2}}\n-- old: {{#1}}"
               (lib/raw-native-query result))
            "The tag in the comment should be left alone")))

    (testing "Card tag inside a block comment should NOT be replaced"
      (let [query  (-> (lib/native-query mp "SELECT * FROM {{#1}} /* see also {{#1}} */")
                       (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))
            result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
        (is (= "SELECT * FROM {{#2}} /* see also {{#1}} */"
               (lib/raw-native-query result))
            "The tag in the block comment should be left alone")))))

(deftest swap-card-in-native-query-string-literal-test
  (testing "Card tag inside a SQL string literal is also replaced (parser does not distinguish string literals)"
    (let [mp     (metadata-provider-with-cards)
          query  (-> (lib/native-query mp "SELECT * FROM {{#1}} WHERE col = '{{#1}}'")
                     (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}}))
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (= "SELECT * FROM {{#2}} WHERE col = '{{#2}}'"
             (lib/raw-native-query result))
          "Both tags are replaced since the parser treats string literal tags as params too"))))

(deftest swap-card-in-native-query-multiple-cards-test
  (testing "Multiple different card tags, replace only the target"
    (let [mp     (metadata-provider-with-cards)
          query  (-> (lib/native-query mp "SELECT a.* FROM {{#1}} a JOIN {{#3}} b ON a.id = b.id JOIN {{#1}} c ON a.id = c.id")
                     (lib/with-template-tags {"#1" {:type :card :card-id 1 :name "#1" :display-name "#1"}
                                              "#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}}))
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (= "SELECT a.* FROM {{#2}} a JOIN {{#3}} b ON a.id = b.id JOIN {{#2}} c ON a.id = c.id"
             (lib/raw-native-query result)))
      (is (= 2 (get-in (lib/template-tags result) ["#2" :card-id])))
      (is (= 3 (get-in (lib/template-tags result) ["#3" :card-id]))))))

;;; ------------------------------------------------ Native Query Card Reference Tests ------------------------------------------------
;;; These tests cover card→card replacement specifically in native SQL queries using {{#id}} syntax

(deftest swap-native-card-ref-with-whitespace-test
  (testing "Card reference with whitespace ({{ #1 }}) is replaced correctly"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM {{ #1 }} WHERE x > 1")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "{{#2}}"))
      (is (not (str/includes? (lib/raw-native-query result) "#1"))))))

(deftest swap-native-card-ref-multiple-test
  (testing "Multiple card references to the same card are all replaced"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM {{#1}} a JOIN {{#1}} b ON a.id = b.id")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (= 2 (count (re-seq #"\{\{#2\}\}" (lib/raw-native-query result)))))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

(deftest swap-native-card-ref-in-cte-test
  (testing "Card reference in CTE is replaced correctly"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "WITH base AS {{#1}} SELECT * FROM base WHERE x > 1")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "WITH base AS {{#2}}"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

(deftest swap-native-card-ref-with-alias-test
  (testing "Card reference with alias ({{#1}} AS t) is replaced correctly"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT t.* FROM {{#1}} AS t WHERE t.x > 1")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "{{#2}} AS t"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

(deftest swap-native-card-ref-preserves-other-params-test
  (testing "Other template params are preserved when replacing card reference"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM {{#1}} WHERE status = {{status}} AND total > {{min_total}}")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "{{#2}}"))
      (is (str/includes? (lib/raw-native-query result) "{{status}}"))
      (is (str/includes? (lib/raw-native-query result) "{{min_total}}"))
      (is (contains? (lib/template-tags result) "status"))
      (is (contains? (lib/template-tags result) "min_total")))))

(deftest swap-native-card-ref-different-cards-test
  (testing "Only the specified card reference is replaced, others are preserved"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM {{#1}} a JOIN {{#3}} b ON a.id = b.id")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "{{#2}}"))
      (is (str/includes? (lib/raw-native-query result) "{{#3}}"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

(deftest swap-native-card-ref-in-subquery-test
  (testing "Card reference in subquery is replaced correctly"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM orders WHERE product_id IN (SELECT id FROM {{#1}})")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "FROM {{#2}}"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

(deftest swap-native-card-ref-in-optional-clause-test
  (testing "Card reference inside optional clause [[...{{#1}}...]] is replaced correctly"
    (let [mp     (metadata-provider-with-cards)
          query  (lib/native-query mp "SELECT * FROM orders WHERE 1=1 [[AND product_id IN (SELECT id FROM {{#1}})]]\n")
          result (source-swap.native/update-native-stages query [:card 1] [:card 2] {})]
      (is (str/includes? (lib/raw-native-query result) "{{#2}}"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1}}"))))))

;;; ------------------------------------------------ Native Query Table→Table Tests ------------------------------------------------
;;; These tests cover table→table replacement in native SQL queries using sql-tools

(deftest replace-table-in-native-sql-basic-test
  (testing "Basic table rename in native SQL"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "ORDERS "))))))

(deftest replace-table-in-native-sql-with-template-tags-test
  (testing "Table rename preserves template tags"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS WHERE status = {{status}}"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-with-optional-clause-test
  (testing "Table rename works with optional clauses"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS WHERE 1=1 [[AND status = {{status}}]]"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "[["))
      (is (str/includes? result "]]"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-table-in-optional-test
  (testing "Table inside optional clause is renamed"
    ;; Note: [[...]] must contain at least one {{param}} per Metabase parser rules
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS WHERE 1=1 [[AND product_id IN (SELECT id FROM PRODUCTS WHERE cat = {{cat}})]]"
                                                                   "PRODUCTS" "NEW_PRODUCTS")]
      (is (str/includes? result "NEW_PRODUCTS"))
      (is (not (str/includes? result "FROM PRODUCTS"))))))

(deftest replace-table-in-native-sql-with-join-test
  (testing "Table rename in JOIN"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id"
                                                                   "PRODUCTS" "NEW_PRODUCTS")]
      (is (str/includes? result "NEW_PRODUCTS"))
      (is (str/includes? result "ORDERS")))))

(deftest replace-table-in-native-sql-with-cte-test
  (testing "Table inside CTE is renamed"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "WITH recent AS (SELECT * FROM ORDERS WHERE created > '2024-01-01') SELECT * FROM recent"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "recent")))))

(deftest replace-table-in-native-sql-multiple-tags-test
  (testing "Table rename with multiple template tags"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS WHERE status = {{status}} AND total > {{min_total}}"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "{{status}}"))
      (is (str/includes? result "{{min_total}}")))))

(deftest replace-table-in-native-sql-nested-optionals-test
  (testing "Table rename with nested optional clauses"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS WHERE 1=1 [[AND total > {{min}} [[AND status = {{status}}]]]]"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "[["))
      (is (str/includes? result "{{min}}"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-comment-with-bracket-markers-test
  (testing "SQL comments containing bracket markers are not modified"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM\n-- /*]]*/ \nORDERS LIMIT 5"
                                                                   "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "/*]]*/") "Comment with bracket marker should be preserved"))))

;;; ------------------------------------------------ Schema-Qualified Native SQL Tests ------------------------------------------------

(deftest replace-table-in-native-sql-schema-qualified-test
  (testing "Schema-qualified table reference is matched and renamed"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM PUBLIC.ORDERS"
                                                                   {:schema "PUBLIC" :table "ORDERS"}
                                                                   {:schema "PUBLIC" :table "NEW_ORDERS"})]
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "ORDERS ")))))

  (testing "Cross-schema rename: PUBLIC.ORDERS → ANALYTICS.NEW_ORDERS"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM PUBLIC.ORDERS"
                                                                   {:schema "PUBLIC" :table "ORDERS"}
                                                                   {:schema "ANALYTICS" :table "NEW_ORDERS"})]
      (is (str/includes? result "ANALYTICS"))
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "PUBLIC")))))

  (testing "Unqualified SQL still matches when old-table has schema"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS"
                                                                   {:schema "PUBLIC" :table "ORDERS"}
                                                                   {:schema "PUBLIC" :table "NEW_ORDERS"})]
      (is (str/includes? result "NEW_ORDERS"))))

  (testing "Schema-qualified table→card clears the schema (no PUBLIC.{{#card}} in output)"
    ;; Just a plain string — replace-table-in-native-sql infers schema clearing
    ;; because old-table has a schema and new-table doesn't
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM PUBLIC.ORDERS"
                                                                   {:schema "PUBLIC" :table "ORDERS"}
                                                                   "{{#123-my-card}}")]
      (is (str/includes? result "{{#123-my-card}}"))
      (is (not (str/includes? result "PUBLIC.{{"))
          "Schema must be cleared, not left as PUBLIC.{{#card}}")
      (is (not (str/includes? result "PUBLIC")))))

  (testing "Card reference must not be quoted in SQL output"
    (let [result (#'source-swap.native/replace-table-in-native-sql :h2
                                                                   "SELECT * FROM ORDERS"
                                                                   {:table "ORDERS"}
                                                                   "{{#123-my-card}}")]
      (is (= "SELECT * FROM {{#123-my-card}}" result)
          "Card reference should not be wrapped in double quotes"))))

;;; ------------------------------------------------ table→table for native queries ------------------------------------------------

(deftest replace-table-in-native-query-test
  (testing "table→table: SQL table reference is updated"
    (let [query  (lib/native-query meta/metadata-provider "SELECT * FROM PRODUCTS")
          result (source-swap.native/update-native-stages query
                                                          [:table (meta/id :products)]
                                                          [:table (meta/id :orders)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "ORDERS"))
      (is (not (str/includes? (lib/raw-native-query result) "PRODUCTS")))))

  (testing "table→table: template tags are preserved"
    (let [query  (lib/native-query meta/metadata-provider "SELECT * FROM PRODUCTS WHERE category = {{category}}")
          result (source-swap.native/update-native-stages query
                                                          [:table (meta/id :products)]
                                                          [:table (meta/id :orders)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "ORDERS"))
      (is (not (str/includes? (lib/raw-native-query result) "PRODUCTS")))
      (is (str/includes? (lib/raw-native-query result) "{{category}}"))))

  (testing "table→table: only the target table is renamed in a JOIN"
    (let [query  (lib/native-query meta/metadata-provider "SELECT o.*, p.title FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id")
          result (source-swap.native/update-native-stages query
                                                          [:table (meta/id :orders)]
                                                          [:table (meta/id :reviews)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "REVIEWS"))
      (is (str/includes? (lib/raw-native-query result) "PRODUCTS"))
      (is (not (str/includes? (lib/raw-native-query result) "ORDERS")))))

  (testing "table→table: schema-qualified SQL reference is replaced"
    (let [query  (lib/native-query meta/metadata-provider "SELECT * FROM PUBLIC.PRODUCTS")
          result (source-swap.native/update-native-stages query
                                                          [:table (meta/id :products)]
                                                          [:table (meta/id :orders)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "ORDERS"))
      (is (not (str/includes? (lib/raw-native-query result) "PRODUCTS"))))))

;;; ------------------------------------------------ table→card for native queries ------------------------------------------------

(deftest replace-table-with-card-in-native-test
  (let [mp (metadata-provider-with-cards)]
    (testing "table→card: SQL gets card template tag"
      (let [query  (lib/native-query mp "SELECT * FROM PRODUCTS")
            result (source-swap.native/update-native-stages query
                                                            [:table (meta/id :products)]
                                                            [:card 1]
                                                            {})]
        (is (str/includes? (lib/raw-native-query result) "{{#1-card-1}}"))
        (is (not (str/includes? (lib/raw-native-query result) "PRODUCTS")))
        (is (= 1 (get-in (lib/template-tags result) ["#1-card-1" :card-id])))))

    (testing "table→card: existing template tags are preserved"
      (let [query  (lib/native-query mp "SELECT * FROM PRODUCTS WHERE category = {{category}}")
            result (source-swap.native/update-native-stages query
                                                            [:table (meta/id :products)]
                                                            [:card 1]
                                                            {})]
        (is (str/includes? (lib/raw-native-query result) "{{#1-card-1}}"))
        (is (str/includes? (lib/raw-native-query result) "{{category}}"))
        (is (contains? (lib/template-tags result) "category"))
        (is (= 1 (get-in (lib/template-tags result) ["#1-card-1" :card-id])))))

    (testing "table→card: schema-qualified SQL gets card ref without schema prefix"
      (let [query  (lib/native-query mp "SELECT * FROM PUBLIC.PRODUCTS")
            result (source-swap.native/update-native-stages query
                                                            [:table (meta/id :products)]
                                                            [:card 1]
                                                            {})]
        (is (str/includes? (lib/raw-native-query result) "{{#1-card-1}}"))
        (is (not (str/includes? (lib/raw-native-query result) "PUBLIC.{{")))
        (is (not (str/includes? (lib/raw-native-query result) "PRODUCTS")))))))

;;; ------------------------------------------------ card→table for native queries ------------------------------------------------

(deftest replace-card-with-table-in-native-test
  (testing "card→table: card ref becomes direct table reference"
    (let [query  (-> (lib/native-query meta/metadata-provider "SELECT * FROM {{#1-card-1}}")
                     (lib/with-template-tags {"#1-card-1" {:type :card :card-id 1 :name "#1-card-1" :display-name "#1-card-1"}}))
          result (source-swap.native/update-native-stages query
                                                          [:card 1]
                                                          [:table (meta/id :orders)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "ORDERS"))
      (is (not (str/includes? (lib/raw-native-query result) "{{#1")))
      (is (empty? (filter #(= (:card-id %) 1) (vals (lib/template-tags result)))))))

  (testing "card→table: other template tags are preserved"
    (let [query  (-> (lib/native-query meta/metadata-provider "SELECT * FROM {{#1-card-1}} WHERE status = {{status}}")
                     (lib/with-template-tags {"#1-card-1" {:type :card :card-id 1 :name "#1-card-1" :display-name "#1-card-1"}}))
          result (source-swap.native/update-native-stages query
                                                          [:card 1]
                                                          [:table (meta/id :orders)]
                                                          {})]
      (is (str/includes? (lib/raw-native-query result) "ORDERS"))
      (is (str/includes? (lib/raw-native-query result) "{{status}}"))
      (is (contains? (lib/template-tags result) "status"))
      (is (empty? (filter #(= (:card-id %) 1) (vals (lib/template-tags result))))))))

;;; ------------------------------------------------ Table Tag Tests ------------------------------------------------

(deftest swap-table-to-table-with-table-tag-test
  (testing "swap-source table → table: {{table}} tag's :table-id is updated"
    (let [query  (-> (lib/native-query meta/metadata-provider "SELECT * FROM {{my_table}}")
                     (lib/with-template-tags {"my_table" {:type :table :table-id 1 :name "my_table" :display-name "My Table"}}))
          result (#'source-swap.native/update-table-tags-for-table-swap
                  (lib/template-tags query)
                  1 2)]
      (is (= 2 (get-in result ["my_table" :table-id]))))))

(deftest swap-table-to-card-with-table-tag-test
  (testing "swap-source table → card: {{my_table}} becomes {{#card-id-slug}}"
    (let [sql "SELECT * FROM {{my_table}}"
          tags {"my_table" {:type :table :table-id 1 :name "my_table" :display-name "My Table"}}
          {:keys [sql template-tags]} (#'source-swap.native/update-table-tags-for-card-swap sql tags 1 2 "New Card")]
      ;; SQL should have card reference
      (is (str/includes? sql "{{#2-new-card}}"))
      (is (not (str/includes? sql "{{my_table}}")))
      ;; Template tag should be :type :card now
      (is (= :card (get-in template-tags ["#2-new-card" :type])))
      (is (= 2 (get-in template-tags ["#2-new-card" :card-id])))
      ;; Old table tag should be gone
      (is (not (contains? template-tags "my_table"))))))

(deftest swap-table-to-card-preserves-required-flag-test
  (testing "swap-source table → card: :required flag is preserved"
    (let [sql "SELECT * FROM {{my_table}}"
          tags {"my_table" {:type     :table
                            :table-id 1
                            :name     "my_table"
                            :display-name "My Table"
                            :required true
                            :default  "fallback"}}
          {:keys [template-tags]} (#'source-swap.native/update-table-tags-for-card-swap sql tags 1 2 "New Card")]
      ;; :required and :default should be preserved
      (is (= true (get-in template-tags ["#2-new-card" :required])))
      (is (= "fallback" (get-in template-tags ["#2-new-card" :default]))))))

;;; ------------------------------------------------ Dimension Tag Tests ------------------------------------------------

(deftest update-dimension-tags-test
  (testing "dimension tag field ref is remapped to new table's field"
    (let [query  (lib/native-query meta/metadata-provider "SELECT 1")
          tags   {"filter" {:type :dimension
                            :name "filter"
                            :dimension (field-id-ref meta/metadata-provider (meta/id :products :id))}}
          result (#'source-swap.native/update-dimension-tags query tags (meta/id :products) (meta/id :orders))]
      (is (=? {"filter" {:dimension [:field {} (meta/id :orders :id)]}}
              result)))))

(deftest update-dimension-tags-no-match-test
  (testing "dimension tag left unchanged when no matching field on new table"
    (let [query     (lib/native-query meta/metadata-provider "SELECT 1")
          dimension (field-id-ref meta/metadata-provider (meta/id :products :ean))
          tags      {"filter" {:type :dimension
                               :name "filter"
                               :dimension dimension}}
          ;; Orders table doesn't have an EAN field
          result (#'source-swap.native/update-dimension-tags query tags (meta/id :products) (meta/id :orders))]
      ;; Should be unchanged since no matching field
      (is (= dimension
             (get-in result ["filter" :dimension]))))))
