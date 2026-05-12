(ns metabase-enterprise.transform-optimizer.prompt-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.prompt :as prompt]))

(set! *warn-on-reflection* true)

(def ^:private synthetic-ctx
  {:transform {:id 42
               :name "monthly_revenue"
               :source_database_id 1
               :target {:schema "analytics" :name "monthly_revenue"}}
   :sql "SELECT date_trunc('month', ordered_at) AS m, sum(total_cents) FROM shop.orders GROUP BY 1"
   :sources [{:schema       "shop"
              :table_name   "orders"
              :db_id        1
              :column_count 7
              :fields       [{:name "id"
                              :base_type :type/BigInteger
                              :semantic_type :type/PK
                              :indexed? true}
                             {:name "customer_id"
                              :base_type :type/BigInteger
                              :foreign_key {:target_schema "shop"
                                            :target_table  "customers"
                                            :target_column "id"}}
                             {:name "ordered_at"
                              :base_type :type/DateTimeWithTZ}]
              :indexes      [{:name "orders_pkey"
                              :access_method "btree"
                              :is_primary true
                              :is_unique true
                              :key_columns ["id"]
                              :include_columns []
                              :definition "CREATE UNIQUE INDEX orders_pkey ON shop.orders USING btree (id)"}]}]
   :target {:schema "analytics" :table_name "monthly_revenue" :column_count 2 :fields []}
   :indexes_partial? false
   :explain [{:Plan {:Node-Type "Aggregate" :Total-Cost 1234.56}}]
   :run_history [{:start_time "2026-05-12T10:00:00Z"
                  :end_time   "2026-05-12T10:00:08Z"
                  :duration_ms 8000
                  :status :succeeded
                  :run_method :manual}]})

(deftest section-headers-present-test
  (let [out (prompt/render-context synthetic-ctx)]
    (testing "all required section headers appear in the rendered output"
      (doseq [section ["## Transform"
                       "## SQL"
                       "## Referenced tables"
                       "## EXPLAIN"
                       "## Run history"]]
        (is (str/includes? out section)
            (str "missing section: " section))))))

(deftest transform-block-renders-test
  (let [out (prompt/render-context synthetic-ctx)]
    (is (str/includes? out "id: 42"))
    (is (str/includes? out "name: monthly_revenue"))
    (is (str/includes? out "analytics.monthly_revenue"))))

(deftest sql-block-renders-as-code-fence-test
  (let [out (prompt/render-context synthetic-ctx)]
    (is (str/includes? out "```sql"))
    (is (str/includes? out "SELECT date_trunc"))))

(deftest source-table-block-includes-indexes-and-fks-test
  (let [out (prompt/render-context synthetic-ctx)]
    (is (str/includes? out "### shop.orders"))
    (testing "field-level FK is rendered"
      (is (str/includes? out "FK → shop.customers.id")))
    (testing "field-level indexed? flag is rendered"
      (is (str/includes? out "[indexed]")))
    (testing "index detail is rendered"
      (is (str/includes? out "orders_pkey"))
      (is (str/includes? out "CREATE UNIQUE INDEX orders_pkey")))))

(deftest indexes-partial-warning-test
  (testing "partial flag adds a warning callout"
    (let [out (prompt/render-context (assoc synthetic-ctx :indexes_partial? true))]
      (is (re-find #"(?i)partial" out)))))

(deftest no-runs-renders-gracefully-test
  (let [out (prompt/render-context (assoc synthetic-ctx :run_history []))]
    (is (str/includes? out "(no run history)"))))

(deftest no-explain-renders-gracefully-test
  (let [out (prompt/render-context (assoc synthetic-ctx :explain nil))]
    (is (str/includes? out "EXPLAIN unavailable"))))

(deftest compile-failure-renders-marker-test
  (testing "nil SQL is rendered with a clear marker rather than blank"
    (let [out (prompt/render-context (assoc synthetic-ctx :sql nil))]
      (is (str/includes? out "compilation failed")))))

(deftest table-with-no-indexes-renders-test
  (testing "a source with no indexes gets an explicit '(none beyond PK)' marker"
    (let [out (prompt/render-context
               (assoc synthetic-ctx :sources
                      [(assoc (first (:sources synthetic-ctx)) :indexes [])]))]
      (is (str/includes? out "indexes: (none beyond PK)")))))
