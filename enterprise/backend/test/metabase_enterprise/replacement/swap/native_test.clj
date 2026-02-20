(ns metabase-enterprise.replacement.swap.native-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.swap.native :as swap.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- wait-for-result-metadata
  "Poll until `result_metadata` is populated on the card, up to `timeout-ms` (default 5000)."
  ([card-id] (wait-for-result-metadata card-id 5000))
  ([card-id timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
         (if (seq metadata)
           metadata
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 200)
                 (recur))
             (throw (ex-info "Timed out waiting for result_metadata" {:card-id card-id})))))))))

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- native-card-sourced-from
  "Create a native card map that references `inner-card` via {{#id}}."
  [card-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id inner-card) "}}"))
     :visualization_settings {}}))

(defmacro ^:private with-restored-card-queries
  "Snapshots every card's `dataset_query` before `body` and restores them
  afterwards, so that swap-source side-effects on pre-existing cards don't
  leak between tests."
  [& body]
  `(let [snapshot# (into {} (t2/select-fn->fn :id :dataset_query :model/Card))]
     (try
       ~@body
       (finally
         (doseq [[id# old-query#] snapshot#
                 :let [current# (t2/select-one-fn :dataset_query :model/Card :id id#)]
                 :when (and (some? old-query#) (not= old-query# current#))]
           (t2/update! :model/Card id# {:dataset_query old-query#}))))))

;;; ----------------------------------------- swap-card-in-native-query (pure) ------------------------------------------

(defn- make-native-query
  "Build a minimal pMBQL native dataset-query with the given SQL and template-tags."
  [sql template-tags]
  {:stages [{:lib/type      :mbql.stage/native
             :native        sql
             :template-tags template-tags}]})

(deftest swap-card-in-native-query-basic-test
  (testing "Simple card tag replacement"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}}"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}}"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))))

  (testing "Multiple card tags, only matching one is replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} JOIN {{#7}} ON 1=1"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "#7" {:type :card :card-id 7 :name "#7" :display-name "#7"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} JOIN {{#7}} ON 1=1"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= 7 (get-in result [:stages 0 :template-tags "#7" :card-id]))))))

(deftest swap-card-in-native-query-with-field-filters-test
  (testing "Card tag with field filter tags present"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} WHERE {{created_at}}"
                  {"#3"        {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "created_at" {:type :dimension :name "created_at" :display-name "Created At"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} WHERE {{created_at}}"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= "created_at"
             (get-in result [:stages 0 :template-tags "created_at" :name]))))))

(deftest swap-card-in-native-query-with-optional-clauses-test
  (testing "Card tag with optional clause containing field filter"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} [[WHERE {{created_at}}]]"
                  {"#3"         {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "created_at" {:type :dimension :name "created_at" :display-name "Created At"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} [[WHERE {{created_at}}]]"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))))

  (testing "Card tag inside optional clause"
    (let [query  (make-native-query
                  "SELECT * FROM foo [[JOIN {{#3}} ON 1=1]]"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM foo [[JOIN {{#99}} ON 1=1]]"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id]))))))

(deftest swap-card-in-native-query-comment-test
  (testing "Card tag inside a line comment should NOT be replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}}\n-- old: {{#3}}"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}}\n-- old: {{#3}}"
             (get-in result [:stages 0 :native]))
          "The tag in the comment should be left alone")))

  (testing "Card tag inside a block comment should NOT be replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} /* see also {{#3}} */"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} /* see also {{#3}} */"
             (get-in result [:stages 0 :native]))
          "The tag in the block comment should be left alone"))))

(deftest swap-card-in-native-query-string-literal-test
  (testing "Card tag inside a SQL string literal is also replaced (parser does not distinguish string literals)"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} WHERE col = '{{#3}}'"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} WHERE col = '{{#99}}'"
             (get-in result [:stages 0 :native]))
          "Both tags are replaced since the parser treats string literal tags as params too"))))

(deftest swap-card-in-native-query-multiple-cards-test
  (testing "Multiple different card tags, replace only the target"
    (let [query  (make-native-query
                  "SELECT a.* FROM {{#3}} a JOIN {{#5}} b ON a.id = b.id JOIN {{#3}} c ON a.id = c.id"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "#5" {:type :card :card-id 5 :name "#5" :display-name "#5"}})
          result (#'swap.native/swap-card-in-native-query query 3 99)]
      (is (= "SELECT a.* FROM {{#99}} a JOIN {{#5}} b ON a.id = b.id JOIN {{#99}} c ON a.id = c.id"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= 5 (get-in result [:stages 0 :template-tags "#5" :card-id]))))))

;;; ------------------------------------------------ Native Query Card Reference Tests ------------------------------------------------
;;; These tests cover card→card replacement specifically in native SQL queries using {{#id}} syntax

(deftest swap-native-card-ref-with-slug-test
  (testing "Card reference with slug ({{#42-my-query-name}}) is replaced with new card's slug"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {new-card-id :id} {:name "New Target Query"}
                       :model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999-old-query-name}} WHERE x > 1")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 9999]
                             [:card new-card-id])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            ;; Should have new card ID with slugified name
            (is (str/includes? query (str "{{#" new-card-id "-new-target-query}}")))
            (is (not (str/includes? query "{{#999")))))))))

(deftest swap-native-card-ref-with-slug-template-tags-test
  (testing "Template tags are updated with slug to match SQL when swapping slugged card refs"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {products-id :id} {:name "All Products"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                       :model/Card {orders-a-id :id} {:name "All Orders A"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {orders-b-id :id} {:name "All Orders B"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {native-card-id :id}
                       {:dataset_query
                        (lib/native-query mp (str "SELECT p.*, o.* "
                                                  "FROM {{#" products-id "-all-products}} p "
                                                  "JOIN {{#" orders-a-id "-all-orders-a}} o ON p.id = o.product_id"))}]
          ;; Swap orders A -> orders B
          (field-refs/upgrade! [:card native-card-id])
          (source-swap/swap! [:card native-card-id]
                             [:card orders-a-id]
                             [:card orders-b-id])
          (let [updated-card  (t2/select-one :model/Card :id native-card-id)
                updated-query (:dataset_query updated-card)
                sql           (lib/raw-native-query updated-query)
                template-tags (get-in updated-query [:stages 0 :template-tags])]
            ;; SQL should have the new slugged reference
            (is (str/includes? sql (str "{{#" orders-b-id "-all-orders-b}}")))
            (is (not (str/includes? sql (str "{{#" orders-a-id))))
            ;; Template tags should have matching key
            (is (contains? template-tags (str "#" orders-b-id "-all-orders-b")))
            (is (not (contains? template-tags (str "#" orders-a-id "-all-orders-a"))))
            ;; Products reference should be unchanged
            (is (str/includes? sql (str "{{#" products-id "-all-products}}")))
            (is (contains? template-tags (str "#" products-id "-all-products")))))))))

(deftest swap-native-kitchen-sink-test
  (testing "Kitchen sink: multiple card refs with slugs, nested optionals, swapping one source"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {products-a-id :id} {:name "All Products A"
                                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                       :model/Card {products-b-id :id} {:name "All Products B"
                                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                       :model/Card {orders-a-id :id}   {:name "All Orders A"
                                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {orders-b-id :id}   {:name "All Orders B"
                                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {kitchen-sink-id :id}
                       {:dataset_query
                        (lib/native-query mp (str "WITH filtered_products AS ("
                                                  "  SELECT * FROM {{#" products-a-id "-all-products-a}}"
                                                  "  WHERE 1=1"
                                                  "  [[AND price >= {{min_price}}]]"
                                                  "),"
                                                  "order_data AS ("
                                                  "  SELECT product_id, COUNT(*) as cnt"
                                                  "  FROM {{#" orders-a-id "-all-orders-a}}"
                                                  "  WHERE 1=1"
                                                  "  [[AND quantity >= {{min_qty}}"
                                                  "    [[AND total >= {{min_total}}]]"
                                                  "  ]]"
                                                  "  GROUP BY product_id"
                                                  ")"
                                                  "SELECT p.*, o.cnt FROM filtered_products p "
                                                  "LEFT JOIN order_data o ON p.id = o.product_id"))}]
          ;; Swap products A -> products B (orders should stay as-is)
          (field-refs/upgrade! [:card kitchen-sink-id])
          (source-swap/swap! [:card kitchen-sink-id]
                             [:card products-a-id]
                             [:card products-b-id])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id kitchen-sink-id))
                sql           (lib/raw-native-query updated-query)
                template-tags (get-in updated-query [:stages 0 :template-tags])]
            ;; Products A should be replaced with Products B (with slug)
            (is (str/includes? sql (str "{{#" products-b-id "-all-products-b}}")))
            (is (not (str/includes? sql (str "{{#" products-a-id))))
            (is (contains? template-tags (str "#" products-b-id "-all-products-b")))
            ;; Orders A should be unchanged
            (is (str/includes? sql (str "{{#" orders-a-id "-all-orders-a}}")))
            (is (contains? template-tags (str "#" orders-a-id "-all-orders-a")))
            ;; Other params should be unchanged
            (is (contains? template-tags "min_price"))
            (is (contains? template-tags "min_qty"))
            (is (contains? template-tags "min_total"))))))))

(deftest swap-native-card-ref-with-whitespace-test
  (testing "Card reference with whitespace ({{ #42 }}) is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{ #999 }} WHERE x > 1")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "#999")))))))))

(deftest swap-native-card-ref-multiple-test
  (testing "Multiple card references to the same card are all replaced"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} a JOIN {{#999}} b ON a.id = b.id")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (= 2 (count (re-seq #"\{\{#888\}\}" query))))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-cte-test
  (testing "Card reference in CTE is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "WITH base AS {{#999}} SELECT * FROM base WHERE x > 1")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "WITH base AS {{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-with-alias-test
  (testing "Card reference with alias ({{#42}} AS t) is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT t.* FROM {{#999}} AS t WHERE t.x > 1")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}} AS t"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-preserves-other-params-test
  (testing "Other template params are preserved when replacing card reference"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} WHERE status = {{status}} AND total > {{min_total}}")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)
                tags          (lib/template-tags updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (str/includes? query "{{status}}"))
            (is (str/includes? query "{{min_total}}"))
            (is (contains? tags "status"))
            (is (contains? tags "min_total"))))))))

(deftest swap-native-card-ref-different-cards-test
  (testing "Only the specified card reference is replaced, others are preserved"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} a JOIN {{#777}} b ON a.id = b.id")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (str/includes? query "{{#777}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-subquery-test
  (testing "Card reference in subquery is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM orders WHERE product_id IN (SELECT id FROM {{#999}})")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "FROM {{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-optional-clause-test
  (testing "Card reference inside optional clause [[...{{#42}}...]] is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM orders WHERE 1=1 [[AND product_id IN (SELECT id FROM {{#999}})]]\n")}]
          (field-refs/upgrade! [:card card-id])
          (source-swap/swap! [:card card-id]
                             [:card 999]
                             [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

;;; ------------------------------------------------ Native Query Table→Table Tests ------------------------------------------------
;;; These tests cover table→table replacement in native SQL queries using sql-tools

(deftest replace-table-in-native-sql-basic-test
  (testing "Basic table rename in native SQL"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "ORDERS "))))))

(deftest replace-table-in-native-sql-with-template-tags-test
  (testing "Table rename preserves template tags"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS WHERE status = {{status}}"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-with-optional-clause-test
  (testing "Table rename works with optional clauses"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS WHERE 1=1 [[AND status = {{status}}]]"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "[["))
      (is (str/includes? result "]]"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-table-in-optional-test
  (testing "Table inside optional clause is renamed"
    ;; Note: [[...]] must contain at least one {{param}} per Metabase parser rules
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS WHERE 1=1 [[AND product_id IN (SELECT id FROM PRODUCTS WHERE cat = {{cat}})]]"
                                                            "PRODUCTS" "NEW_PRODUCTS")]
      (is (str/includes? result "NEW_PRODUCTS"))
      (is (not (str/includes? result "FROM PRODUCTS"))))))

(deftest replace-table-in-native-sql-with-join-test
  (testing "Table rename in JOIN"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id"
                                                            "PRODUCTS" "NEW_PRODUCTS")]
      (is (str/includes? result "NEW_PRODUCTS"))
      (is (str/includes? result "ORDERS")))))

(deftest replace-table-in-native-sql-with-cte-test
  (testing "Table inside CTE is renamed"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "WITH recent AS (SELECT * FROM ORDERS WHERE created > '2024-01-01') SELECT * FROM recent"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "recent")))))

(deftest replace-table-in-native-sql-multiple-tags-test
  (testing "Table rename with multiple template tags"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS WHERE status = {{status}} AND total > {{min_total}}"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "{{status}}"))
      (is (str/includes? result "{{min_total}}")))))

(deftest replace-table-in-native-sql-nested-optionals-test
  (testing "Table rename with nested optional clauses"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS WHERE 1=1 [[AND total > {{min}} [[AND status = {{status}}]]]]"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "[["))
      (is (str/includes? result "{{min}}"))
      (is (str/includes? result "{{status}}")))))

(deftest replace-table-in-native-sql-comment-with-bracket-markers-test
  (testing "SQL comments containing bracket markers are not modified"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM\n-- /*]]*/ \nORDERS LIMIT 5"
                                                            "ORDERS" "NEW_ORDERS")]
      (is (str/includes? result "NEW_ORDERS"))
      (is (str/includes? result "/*]]*/") "Comment with bracket marker should be preserved"))))

;;; ------------------------------------------------ Schema-Qualified Native SQL Tests ------------------------------------------------

(deftest replace-table-in-native-sql-schema-qualified-test
  (testing "Schema-qualified table reference is matched and renamed"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM PUBLIC.ORDERS"
                                                            {:table "ORDERS" :schema "PUBLIC"}
                                                            {:schema "PUBLIC" :table "NEW_ORDERS"})]
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "ORDERS ")))))

  (testing "Cross-schema rename: PUBLIC.ORDERS → ANALYTICS.NEW_ORDERS"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM PUBLIC.ORDERS"
                                                            {:table "ORDERS" :schema "PUBLIC"}
                                                            {:schema "ANALYTICS" :table "NEW_ORDERS"})]
      (is (str/includes? result "ANALYTICS"))
      (is (str/includes? result "NEW_ORDERS"))
      (is (not (str/includes? result "PUBLIC")))))

  (testing "Unqualified SQL still matches when old-table has schema"
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM ORDERS"
                                                            {:table "ORDERS" :schema "PUBLIC"}
                                                            {:schema "PUBLIC" :table "NEW_ORDERS"})]
      (is (str/includes? result "NEW_ORDERS"))))

  (testing "Schema-qualified table→card clears the schema (no PUBLIC.{{#card}} in output)"
    ;; Just a plain string — replace-table-in-native-sql infers schema clearing
    ;; because old-table has a schema and new-table doesn't
    (let [result (#'swap.native/replace-table-in-native-sql :h2
                                                            "SELECT * FROM PUBLIC.ORDERS"
                                                            {:table "ORDERS" :schema "PUBLIC"}
                                                            "{{#123-my-card}}")]
      (is (str/includes? result "{{#123-my-card}}"))
      (is (not (str/includes? result "PUBLIC.{{"))
          "Schema must be cleared, not left as PUBLIC.{{#card}}")
      (is (not (str/includes? result "PUBLIC"))))))

;;; ------------------------------------------------ swap-source: table→table for native queries ------------------------------------------------

(deftest swap-source-table-to-table-native-query-test
  (testing "swap-source table → table: native query's SQL table reference is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-table-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp    (mt/metadata-provider)
                    child (card/create-card!
                           {:name                   "Native from Products"
                            :database_id            (mt/id)
                            :display                :table
                            :query_type             :native
                            :type                   :question
                            :dataset_query          (lib/native-query mp "SELECT * FROM PRODUCTS")
                            :visualization_settings {}}
                           user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:table (mt/id :orders)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql           (get-in updated-query [:stages 0 :native])]
                  (is (str/includes? sql "ORDERS"))
                  (is (not (str/includes? sql "PRODUCTS"))))))))))))

(deftest swap-source-table-to-table-native-query-with-params-test
  (testing "swap-source table → table: native query preserves template tags"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-table-native-params@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp    (mt/metadata-provider)
                    child (card/create-card!
                           {:name                   "Native Products with Params"
                            :database_id            (mt/id)
                            :display                :table
                            :query_type             :native
                            :type                   :question
                            :dataset_query          (lib/native-query mp "SELECT * FROM PRODUCTS WHERE category = {{category}}")
                            :visualization_settings {}}
                           user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:table (mt/id :orders)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql           (get-in updated-query [:stages 0 :native])]
                  (is (str/includes? sql "ORDERS"))
                  (is (not (str/includes? sql "PRODUCTS")))
                  (is (str/includes? sql "{{category}}")))))))))))

(deftest swap-source-table-to-table-native-query-join-test
  (testing "swap-source table → table: native query with JOIN has correct table renamed"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-native-join@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp    (mt/metadata-provider)
                    child (card/create-card!
                           {:name                   "Native Join Query"
                            :database_id            (mt/id)
                            :display                :table
                            :query_type             :native
                            :type                   :question
                            :dataset_query          (lib/native-query mp "SELECT o.*, p.title FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id")
                            :visualization_settings {}}
                           user)]
                ;; Swap ORDERS table to REVIEWS table
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :orders)]
                                   [:table (mt/id :reviews)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql           (get-in updated-query [:stages 0 :native])]
                  (is (str/includes? sql "REVIEWS"))
                  (is (str/includes? sql "PRODUCTS")) ;; PRODUCTS should stay
                  (is (not (str/includes? sql "ORDERS"))))))))))))

;;; ------------------------------------------------ swap-source: table→card for native queries ------------------------------------------------

(deftest swap-source-table-to-card-native-query-test
  (testing "swap-source table → card: native query gets card template tag"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp         (mt/metadata-provider)
                    new-source (card/create-card! (card-with-query "New Source Card" :orders) user)
                    _          (wait-for-result-metadata (:id new-source))
                    child      (card/create-card!
                                {:name                   "Native from Products"
                                 :database_id            (mt/id)
                                 :display                :table
                                 :query_type             :native
                                 :type                   :question
                                 :dataset_query          (lib/native-query mp "SELECT * FROM PRODUCTS")
                                 :visualization_settings {}}
                                user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:card (:id new-source)])
                (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql            (get-in updated-query [:stages 0 :native])
                      template-tags  (get-in updated-query [:stages 0 :template-tags])]
                  ;; SQL should have card reference
                  (is (str/includes? sql (str "{{#" (:id new-source))))
                  (is (not (str/includes? sql "PRODUCTS")))
                  ;; Template tag should be added
                  (is (some #(= (:card-id %) (:id new-source)) (vals template-tags))))))))))))

(deftest swap-source-table-to-card-native-query-preserves-params-test
  (testing "swap-source table → card: native query preserves existing template tags"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card-native-params@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp         (mt/metadata-provider)
                    new-source (card/create-card! (card-with-query "New Source Card" :orders) user)
                    _          (wait-for-result-metadata (:id new-source))
                    child      (card/create-card!
                                {:name                   "Native Products with Params"
                                 :database_id            (mt/id)
                                 :display                :table
                                 :query_type             :native
                                 :type                   :question
                                 :dataset_query          (lib/native-query mp "SELECT * FROM PRODUCTS WHERE category = {{category}}")
                                 :visualization_settings {}}
                                user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:card (:id new-source)])
                (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql            (get-in updated-query [:stages 0 :native])
                      template-tags  (get-in updated-query [:stages 0 :template-tags])]
                  ;; SQL should have card reference and keep existing param
                  (is (str/includes? sql (str "{{#" (:id new-source))))
                  (is (str/includes? sql "{{category}}"))
                  ;; Both template tags should exist
                  (is (contains? template-tags "category"))
                  (is (some #(= (:card-id %) (:id new-source)) (vals template-tags))))))))))))

;;; ------------------------------------------------ Card→Table Native Query Tests ------------------------------------------------

(deftest swap-source-card-to-table-native-query-test
  (testing "swap-source card → table: native query's {{#card-id}} becomes direct table reference"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [mp         (mt/metadata-provider)
                  old-source (card/create-card! (card-with-query "Old Source Card" :products) user)
                  _          (wait-for-result-metadata (:id old-source))
                  child      (card/create-card! (native-card-sourced-from "Native Child" old-source) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/swap! [:card (:id child)]
                                 [:card (:id old-source)]
                                 [:table (mt/id :orders)])
              (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    sql            (get-in updated-query [:stages 0 :native])
                    template-tags  (get-in updated-query [:stages 0 :template-tags])]
                ;; SQL should have raw table name, not card ref
                (is (str/includes? sql "ORDERS"))
                (is (not (str/includes? sql (str "{{#" (:id old-source)))))
                ;; Card template tag should be removed
                (is (not (some #(= (:card-id %) (:id old-source)) (vals template-tags))))))))))))

(deftest swap-source-card-to-table-native-query-preserves-params-test
  (testing "swap-source card → table: native query preserves other template tags"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table-native-params@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [mp         (mt/metadata-provider)
                  old-source (card/create-card! (card-with-query "Old Source Card" :products) user)
                  _          (wait-for-result-metadata (:id old-source))
                  child      (card/create-card!
                              {:name                   "Native with Params"
                               :database_id            (mt/id)
                               :display                :table
                               :query_type             :native
                               :type                   :question
                               :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id old-source) "}} WHERE status = {{status}}"))
                               :visualization_settings {}}
                              user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/swap! [:card (:id child)]
                                 [:card (:id old-source)]
                                 [:table (mt/id :orders)])
              (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    sql            (get-in updated-query [:stages 0 :native])
                    template-tags  (get-in updated-query [:stages 0 :template-tags])]
                ;; SQL should have table name and preserve status param
                (is (str/includes? sql "ORDERS"))
                (is (str/includes? sql "{{status}}"))
                ;; Status param should still exist, card tag should be gone
                (is (contains? template-tags "status"))
                (is (not (some #(= (:card-id %) (:id old-source)) (vals template-tags))))))))))))

;;; ------------------------------------------------ Table Tag Tests ------------------------------------------------

(deftest swap-table-to-table-with-table-tag-test
  (testing "swap-source table → table: {{table}} tag's :table-id is updated"
    (let [query  (make-native-query
                  "SELECT * FROM {{my_table}}"
                  {"my_table" {:type :table :table-id 1 :name "my_table" :display-name "My Table"}})
          result (#'swap.native/update-table-tags-for-table-swap
                  (get-in query [:stages 0 :template-tags])
                  1 2)]
      (is (= 2 (get-in result ["my_table" :table-id]))))))

(deftest swap-table-to-card-with-table-tag-test
  (testing "swap-source table → card: {{my_table}} becomes {{#card-id-slug}}"
    (let [sql "SELECT * FROM {{my_table}}"
          tags {"my_table" {:type :table :table-id 1 :name "my_table" :display-name "My Table"}}
          {:keys [sql template-tags]} (#'swap.native/update-table-tags-for-card-swap sql tags 1 99 "New Card")]
      ;; SQL should have card reference
      (is (str/includes? sql "{{#99-new-card}}"))
      (is (not (str/includes? sql "{{my_table}}")))
      ;; Template tag should be :type :card now
      (is (= :card (get-in template-tags ["#99-new-card" :type])))
      (is (= 99 (get-in template-tags ["#99-new-card" :card-id])))
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
          {:keys [template-tags]} (#'swap.native/update-table-tags-for-card-swap sql tags 1 99 "New Card")]
      ;; :required and :default should be preserved
      (is (= true (get-in template-tags ["#99-new-card" :required])))
      (is (= "fallback" (get-in template-tags ["#99-new-card" :default]))))))

;;; ------------------------------------------------ Dimension Tag Tests ------------------------------------------------

(deftest update-dimension-tags-test
  (testing "dimension tag field ref is remapped to new table's field"
    (mt/dataset test-data
      ;; Get actual field IDs from test data
      (let [products-id-field (t2/select-one :model/Field :table_id (mt/id :products) :name "ID")
            orders-id-field   (t2/select-one :model/Field :table_id (mt/id :orders) :name "ID")
            tags {"filter" {:type :dimension
                            :name "filter"
                            :dimension [:field (:id products-id-field) nil]}}
            result (#'swap.native/update-dimension-tags tags (mt/id :products) (mt/id :orders))]
        (is (= [:field (:id orders-id-field) nil]
               (get-in result ["filter" :dimension])))))))

(deftest update-dimension-tags-no-match-test
  (testing "dimension tag left unchanged when no matching field on new table"
    (mt/dataset test-data
      (let [products-ean-field (t2/select-one :model/Field :table_id (mt/id :products) :name "EAN")
            tags {"filter" {:type :dimension
                            :name "filter"
                            :dimension [:field (:id products-ean-field) nil]}}
            ;; Orders table doesn't have an EAN field
            result (#'swap.native/update-dimension-tags tags (mt/id :products) (mt/id :orders))]
        ;; Should be unchanged since no matching field
        (is (= [:field (:id products-ean-field) nil]
               (get-in result ["filter" :dimension])))))))

;;; ------------------------------------------------ Schema-Qualified Integration Tests ------------------------------------------------
;;; These test the full swap-source path with schema-qualified SQL (e.g., FROM PUBLIC.PRODUCTS)

(deftest swap-source-table-to-table-native-query-with-schema-test
  (testing "swap-source table → table: schema-qualified SQL reference is replaced"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-schema@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp    (mt/metadata-provider)
                    child (card/create-card!
                           {:name                   "Native with Schema"
                            :database_id            (mt/id)
                            :display                :table
                            :query_type             :native
                            :type                   :question
                            :dataset_query          (lib/native-query mp "SELECT * FROM PUBLIC.PRODUCTS")
                            :visualization_settings {}}
                           user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:table (mt/id :orders)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql           (get-in updated-query [:stages 0 :native])]
                  (is (str/includes? sql "ORDERS"))
                  (is (not (str/includes? sql "PRODUCTS"))))))))))))

(deftest swap-source-table-to-card-native-query-with-schema-test
  (testing "swap-source table → card: schema-qualified SQL gets card ref without schema prefix"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card-schema@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [mp         (mt/metadata-provider)
                    new-source (card/create-card! (card-with-query "New Source Card" :orders) user)
                    _          (wait-for-result-metadata (:id new-source))
                    child      (card/create-card!
                                {:name                   "Native with Schema"
                                 :database_id            (mt/id)
                                 :display                :table
                                 :query_type             :native
                                 :type                   :question
                                 :dataset_query          (lib/native-query mp "SELECT * FROM PUBLIC.PRODUCTS")
                                 :visualization_settings {}}
                                user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:table (mt/id :products)]
                                   [:card (:id new-source)])
                (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      sql            (get-in updated-query [:stages 0 :native])
                      template-tags  (get-in updated-query [:stages 0 :template-tags])]
                  ;; SQL should have card reference without schema prefix
                  (is (str/includes? sql (str "{{#" (:id new-source))))
                  (is (not (str/includes? sql "PUBLIC.{{"))
                      "Must not produce schema.{{#card}} — schema should be cleared")
                  (is (not (str/includes? sql "PRODUCTS")))
                  ;; Template tag should be added
                  (is (some #(= (:card-id %) (:id new-source)) (vals template-tags))))))))))))

(deftest swap-source-card-to-table-native-query-with-schema-test
  (testing "swap-source card → table: card ref becomes schema-qualified table name"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table-schema@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [mp         (mt/metadata-provider)
                  old-source (card/create-card! (card-with-query "Old Source Card" :products) user)
                  _          (wait-for-result-metadata (:id old-source))
                  child      (card/create-card! (native-card-sourced-from "Native Child" old-source) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/swap! [:card (:id child)]
                                 [:card (:id old-source)]
                                 [:table (mt/id :orders)])
              (let [updated-query  (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    sql            (get-in updated-query [:stages 0 :native])
                    template-tags  (get-in updated-query [:stages 0 :template-tags])]
                ;; SQL should have schema-qualified table name (H2 tables are in PUBLIC schema)
                (is (str/includes? sql "PUBLIC.ORDERS")
                    "card→table should produce schema-qualified table reference")
                (is (not (str/includes? sql (str "{{#" (:id old-source)))))
                ;; Card template tag should be removed
                (is (not (some #(= (:card-id %) (:id old-source)) (vals template-tags))))))))))))
