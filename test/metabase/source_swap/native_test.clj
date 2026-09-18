(ns metabase.source-swap.native-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.source-swap.native :as source-swap.native]
   [metabase.source-swap.sql :as source-swap.sql]
   [metabase.source-swap.tags :as source-swap.tags]
   [metabase.util.malli :as mu]))

(defn- field-id-ref
  [mp field-id]
  (lib/ref (lib.metadata/field mp field-id)))

(def ^:private metadata-provider-with-cards
  (lib.tu/mock-metadata-provider meta/metadata-provider
                                 {:cards [{:id 1 :name "Card 1" :database-id (meta/id)}
                                          {:id 2 :name "Card 2" :database-id (meta/id)}
                                          {:id 3 :name "Card 3" :database-id (meta/id)}]}))

(deftest ^:parallel swap-card-sql-test
  (doseq [[sql expected]
          [["SELECT * FROM {{#1}}" "SELECT * FROM {{#2}}"]
           ["SELECT * FROM {{#1}} JOIN {{#3}} ON 1=1" "SELECT * FROM {{#2}} JOIN {{#3}} ON 1=1"]
           ["SELECT * FROM {{#1}} WHERE {{created_at}}" "SELECT * FROM {{#2}} WHERE {{created_at}}"]
           ["SELECT * FROM {{#1}} [[WHERE {{created_at}}]]" "SELECT * FROM {{#2}} [[WHERE {{created_at}}]]"]
           ["SELECT * FROM foo [[JOIN {{#1}} ON 1=1]]" "SELECT * FROM foo [[JOIN {{#2}} ON 1=1]]"]
           ["SELECT * FROM {{#1}}\n-- old: {{#1}}" "SELECT * FROM {{#2}}\n-- old: {{#1}}"]
           ["SELECT * FROM {{#1}} /* see {{#1}} */" "SELECT * FROM {{#2}} /* see {{#1}} */"]
           ;; The parameter parser treats tags inside string literals as parameters too.
           ["SELECT * FROM {{#1}} WHERE col = '{{#1}}'" "SELECT * FROM {{#2}} WHERE col = '{{#2}}'"]
           ["SELECT * FROM {{ #1 }} WHERE x > 1" "SELECT * FROM {{#2}} WHERE x > 1"]
           ["SELECT * FROM {{#1}} a JOIN {{#1}} b ON a.id = b.id"
            "SELECT * FROM {{#2}} a JOIN {{#2}} b ON a.id = b.id"]
           ["SELECT a.* FROM {{#1}} a JOIN {{#3}} b ON a.id = b.id JOIN {{#1}} c ON a.id = c.id"
            "SELECT a.* FROM {{#2}} a JOIN {{#3}} b ON a.id = b.id JOIN {{#2}} c ON a.id = c.id"]
           ["WITH base AS {{#1}} SELECT * FROM base WHERE x > 1"
            "WITH base AS {{#2}} SELECT * FROM base WHERE x > 1"]
           ["SELECT t.* FROM {{#1}} AS t WHERE t.x > 1" "SELECT t.* FROM {{#2}} AS t WHERE t.x > 1"]
           ["SELECT * FROM {{#1}} WHERE status = {{status}} AND total > {{min_total}}"
            "SELECT * FROM {{#2}} WHERE status = {{status}} AND total > {{min_total}}"]
           ["SELECT * FROM orders WHERE 1=1 [[AND id IN (SELECT id FROM {{#1}})]]\n"
            "SELECT * FROM orders WHERE 1=1 [[AND id IN (SELECT id FROM {{#2}})]]\n"]
           ["SELECT * FROM {{#1-old-name}} JOIN {{#10}} ON 1=1"
            "SELECT * FROM {{#2-card-2}} JOIN {{#10}} ON 1=1"]]]
    (testing sql
      (let [query  (lib/native-query metadata-provider-with-cards sql)
            result (source-swap.native/swap-source-in-native-stages query [:card 1] [:card 2])]
        (is (= expected (lib/raw-native-query result)))
        (is (= (map #(select-keys % [:name :type :card-id])
                    (lib/template-tags (lib/native-query metadata-provider-with-cards expected)))
               (map #(select-keys % [:name :type :card-id]) (lib/template-tags result))))))))

(deftest ^:parallel swap-card-preserves-field-filter-test
  (let [query (-> (lib/native-query metadata-provider-with-cards "SELECT * FROM {{#1}} [[WHERE {{created_at}}]]")
                  (lib/with-template-tags [{:type :dimension :name "created_at" :display-name "Created At"
                                            :widget-type :date/single}]))
        result (source-swap.native/swap-source-in-native-stages query [:card 1] [:card 2])]
    (is (= (first (filter #(= (:name %) "created_at") (lib/template-tags query)))
           (first (filter #(= (:name %) "created_at") (lib/template-tags result)))))))

(deftest ^:parallel replace-table-in-sql-test
  (doseq [[sql old-table new-table present absent]
          [["SELECT * FROM ORDERS" "ORDERS" "NEW_ORDERS" ["NEW_ORDERS"] ["ORDERS "]]
           ["SELECT * FROM ORDERS WHERE status = {{status}}"
            "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "{{status}}"] []]
           ["SELECT * FROM ORDERS WHERE 1=1 [[AND status = {{status}}]]"
            "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "[[" "]]" "{{status}}"] []]
           ["SELECT * FROM ORDERS WHERE 1=1 [[AND id IN (SELECT id FROM PRODUCTS WHERE cat = {{cat}})]]"
            "PRODUCTS" "NEW_PRODUCTS" ["NEW_PRODUCTS" "{{cat}}"] ["FROM PRODUCTS"]]
           ["SELECT * FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id"
            "PRODUCTS" "NEW_PRODUCTS" ["NEW_PRODUCTS" "ORDERS"] []]
           ["WITH recent AS (SELECT * FROM ORDERS WHERE created > '2024-01-01') SELECT * FROM recent"
            "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "recent"] []]
           ["SELECT * FROM ORDERS WHERE status = {{status}} AND total > {{min_total}}"
            "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "{{status}}" "{{min_total}}"] []]
           ["SELECT * FROM ORDERS WHERE 1=1 [[AND total > {{min}} [[AND status = {{status}}]]]]"
            "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "[[" "{{min}}" "{{status}}"] []]
           ["SELECT * FROM\n-- /*]]*/ \nORDERS LIMIT 5" "ORDERS" "NEW_ORDERS" ["NEW_ORDERS" "/*]]*/"] []]
           ["SELECT * FROM PUBLIC.ORDERS" {:schema "PUBLIC" :table "ORDERS"}
            {:schema "PUBLIC" :table "NEW_ORDERS"} ["NEW_ORDERS"] ["ORDERS "]]
           ["SELECT * FROM PUBLIC.ORDERS" {:schema "PUBLIC" :table "ORDERS"}
            {:schema "ANALYTICS" :table "NEW_ORDERS"} ["ANALYTICS" "NEW_ORDERS"] ["PUBLIC"]]
           ["SELECT * FROM ORDERS" {:schema "PUBLIC" :table "ORDERS"}
            {:schema "PUBLIC" :table "NEW_ORDERS"} ["NEW_ORDERS"] []]
           ["SELECT * FROM PUBLIC.ORDERS" {:schema "PUBLIC" :table "ORDERS"}
            "{{#123-my-card}}" ["{{#123-my-card}}"] ["PUBLIC" "\"{{"]]]]
    (testing (pr-str [sql old-table new-table])
      (let [result (source-swap.sql/replace-table :h2 sql old-table new-table)]
        (doseq [fragment present] (is (str/includes? result fragment)))
        (doseq [fragment absent] (is (not (str/includes? result fragment)))))))
  (is (= "SELECT * FROM {{#123-my-card}}"
         (source-swap.sql/replace-table :h2 "SELECT * FROM ORDERS" {:table "ORDERS"} "{{#123-my-card}}"))))

(deftest ^:parallel swap-native-source-test
  (doseq [[old-source new-source sql present absent expected-tags]
          [[[:table (meta/id :products)] [:table (meta/id :orders)]
            "SELECT * FROM PRODUCTS" ["ORDERS"] ["PRODUCTS"] []]
           [[:table (meta/id :products)] [:table (meta/id :orders)]
            "SELECT * FROM PRODUCTS WHERE category = {{category}}" ["ORDERS" "{{category}}"] ["PRODUCTS"]
            [{:name "category"}]]
           [[:table (meta/id :orders)] [:table (meta/id :reviews)]
            "SELECT o.*, p.title FROM ORDERS o JOIN PRODUCTS p ON o.product_id = p.id"
            ["REVIEWS" "PRODUCTS"] ["ORDERS"] []]
           [[:table (meta/id :products)] [:table (meta/id :orders)]
            "SELECT * FROM PUBLIC.PRODUCTS" ["ORDERS"] ["PRODUCTS"] []]
           [[:table (meta/id :products)] [:card 1]
            "SELECT * FROM PRODUCTS" ["{{#1-card-1}}"] ["PRODUCTS"] [{:name "#1-card-1" :card-id 1}]]
           [[:table (meta/id :products)] [:card 1]
            "SELECT * FROM PRODUCTS WHERE category = {{category}}" ["{{#1-card-1}}" "{{category}}"] []
            [{:name "category"} {:name "#1-card-1" :card-id 1}]]
           [[:table (meta/id :products)] [:card 1]
            "SELECT * FROM PUBLIC.PRODUCTS" ["{{#1-card-1}}"] ["PUBLIC.{{" "PRODUCTS"]
            [{:name "#1-card-1" :card-id 1}]]
           [[:card 1] [:table (meta/id :orders)]
            "SELECT * FROM {{#1-card-1}}" ["ORDERS"] ["{{#1"] []]
           [[:card 1] [:table (meta/id :orders)]
            "SELECT * FROM {{#1-card-1}} WHERE status = {{status}}" ["ORDERS" "{{status}}"] ["{{#1"]
            [{:name "status" :type :text :card-id (symbol "nil #_\"key is not present.\"")}]]]]
    (testing (pr-str [old-source new-source sql])
      (let [result (source-swap.native/swap-source-in-native-stages
                    (lib/native-query metadata-provider-with-cards sql) old-source new-source)
            sql    (lib/raw-native-query result)]
        (doseq [fragment present] (is (str/includes? sql fragment)))
        (doseq [fragment absent] (is (not (str/includes? sql fragment))))
        (is (=? expected-tags (vec (lib/template-tags result))))))))

;;; ------------------------------------------------ Table Tag Tests ------------------------------------------------

(deftest ^:parallel swap-table-to-table-with-table-tag-test
  (testing "swap-source table → table: {{table}} tag's :table-id is updated"
    (let [query  (-> (lib/native-query meta/metadata-provider "SELECT * FROM {{my_table}}")
                     (lib/with-template-tags {"my_table" {:type :table :table-id 1 :name "my_table" :display-name "My Table"}}))
          result (source-swap.tags/table->table
                  (lib/template-tags query)
                  1 2)]
      (is (=? [{:name "my_table", :table-id 2}]
              result)))))

(deftest ^:parallel swap-table-to-card-with-table-tag-test
  (testing "swap-source table → card: {{my_table}} becomes {{#card-id-slug}}"
    (let [sql "SELECT * FROM {{my_table}}"
          tags [{:type :table :table-id 1 :name "my_table" :display-name "My Table"}]
          {:keys [sql template-tags]} (source-swap.tags/table->card sql tags 1 2 "New Card")]
      ;; SQL should have card reference
      (is (str/includes? sql "{{#2-new-card}}"))
      (is (not (str/includes? sql "{{my_table}}")))
      ;; Template tag should be :type :card now; old table tag should be gone
      (is (=? [{:name "#2-new-card", :type :card, :card-id 2}]
              template-tags)))))

(deftest ^:parallel swap-table-to-card-preserves-required-flag-test
  (testing "swap-source table → card: :required flag is preserved"
    (let [sql  "SELECT * FROM {{my_table}}"
          tags [{:type         :table
                 :table-id     1
                 :name         "my_table"
                 :display-name "My Table"
                 :required     true
                 :default      "fallback"}]]
      ;; :required and :default should be preserved
      (is (=? [{:name "#2-new-card", :required true, :default "fallback"}]
              (:template-tags (source-swap.tags/table->card sql tags 1 2 "New Card")))))))

;;; ------------------------------------------------ Dimension Tag Tests ------------------------------------------------

(deftest ^:parallel update-dimension-tags-test
  (testing "dimension tag field ref is remapped to new table's field"
    (let [query  (lib/native-query meta/metadata-provider "SELECT 1")
          tags   [{:type         :dimension
                   :name         "filter"
                   :display-name "Filter"
                   :widget-type  :number/=
                   :dimension    (field-id-ref meta/metadata-provider (meta/id :products :id))}]
          result (source-swap.tags/remap-dimensions query tags (meta/id :products) (meta/id :orders))]
      (is (=? [{:name "filter", :dimension [:field {} (meta/id :orders :id)]}]
              result)))))

(deftest ^:parallel update-dimension-tags-no-match-test
  (testing "dimension tag left unchanged when no matching field on new table"
    (let [query     (lib/native-query meta/metadata-provider "SELECT 1")
          dimension (field-id-ref meta/metadata-provider (meta/id :products :ean))
          tags      [{:type         :dimension
                      :name         "filter"
                      :display-name "Filter"
                      :widget-type  :number/=
                      :dimension    dimension}]
          ;; Orders table doesn't have an EAN field
          result    (source-swap.tags/remap-dimensions query tags (meta/id :products) (meta/id :orders))]
      ;; Should be unchanged since no matching field
      (is (=? [{:name "filter", :dimension dimension}]
              result)))))

(deftest ^:parallel missing-metadata-test
  (doseq [[old-source new-source]
          [[[:table Integer/MAX_VALUE] [:table (meta/id :orders)]]
           [[:table (meta/id :orders)] [:table Integer/MAX_VALUE]]
           [[:table (meta/id :orders)] [:card Integer/MAX_VALUE]]
           [[:card 1] [:table Integer/MAX_VALUE]]
           [[:card 1] [:card Integer/MAX_VALUE]]]]
    (testing (pr-str [old-source new-source])
      (let [query (lib/native-query metadata-provider-with-cards "SELECT * FROM {{#1}}")]
        ;; Metadata lookup schemas require a result; exercise production's nil fallback without instrumentation.
        (mu/disable-enforcement
          (is (= query (source-swap.native/swap-source-in-native-stages query old-source new-source))))))))

(deftest ^:parallel unsupported-conversion-test
  (doseq [[old-source new-source] [[[:other 1] [:card 2]] [[:table 1] [:other 2]]]]
    (is (= {} (source-swap.native/swap-source-in-native-stages {} old-source new-source)))))
