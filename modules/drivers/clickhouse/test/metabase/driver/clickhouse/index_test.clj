(ns ^:mb/driver-tests metabase.driver.clickhouse.index-test
  "Tests for the ClickHouse index driver methods (Index Manager). ClickHouse exercises both lifecycles in one driver:
  the inline ORDER BY at both creation seams (the CTAS in `compile-transform` and the CREATE TABLE in `create-table!`)
  and the post-CTAS data-skipping index (`compile-create-index`, which is multi-statement). Pure rendering/capability
  checks, no connection."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.clickhouse :as clickhouse]))

(deftest ^:parallel feature-flags-test
  (testing "ClickHouse advertises both index lifecycles"
    (is (true? (driver/database-supports? :clickhouse :index/inline-on-ctas nil)))
    (is (true? (driver/database-supports? :clickhouse :index/post-ctas-create nil)))))

;;; --- inline ORDER BY at both creation seams ---

(def ^:private order-by-columns
  [["a" "Int64"] ["b" "Int64"]])

(def ^:private order-by-cases
  ;; The table/column identifiers come from the shared `:sql-jdbc` renderer (double-quoted); the ORDER BY columns are
  ;; rendered with ClickHouse `quote-name` (backticks), matching the driver's pre-existing ORDER BY rendering.
  [{:label        "order-by hint sets the MergeTree sorting key"
    :indexes      [{:kind :order-by :columns [{:name "a"} {:name "b"}]}]
    :ctas         "CREATE TABLE `events` ORDER BY (`a`, `b`) AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" Int64, \"b\" Int64)\nENGINE = MergeTree\nORDER BY (`a`, `b`)\nSETTINGS replicated_deduplication_window = 0"}
   {:label        "no order-by hint -> empty ORDER BY () (unsorted)"
    :indexes      []
    :ctas         "CREATE TABLE `events` ORDER BY () AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" Int64, \"b\" Int64)\nENGINE = MergeTree\nORDER BY ()\nSETTINGS replicated_deduplication_window = 0"}])

(deftest ^:parallel order-by-inlined-at-both-creation-seams-test
  (doseq [{:keys [label indexes ctas create-table]} order-by-cases]
    (testing label
      (testing "CTAS seam (compile-transform, SQL transforms)"
        (is (= [ctas ["p"]]
               (driver/compile-transform :clickhouse {:output-table :events
                                                      :query        {:query "SELECT 1" :params ["p"]}
                                                      :indexes      indexes}))))
      (testing "CREATE TABLE seam (create-table!, Python transforms)"
        (is (= create-table
               (#'clickhouse/create-table!-sql :clickhouse :events order-by-columns {:indexes indexes})))))))

;;; --- post-CTAS data-skipping index ---

(deftest ^:parallel compile-create-index-test
  (testing "a skip-index renders ADD INDEX + MATERIALIZE INDEX (backfill existing parts)"
    (is (= [["ALTER TABLE `events` ADD INDEX `idx_a` (`a`) TYPE minmax GRANULARITY 4"]
            ["ALTER TABLE `events` MATERIALIZE INDEX `idx_a`"]]
           (driver/compile-create-index :clickhouse nil "events"
                                        {:name "idx_a" :columns [{:name "a"}] :type :minmax :granularity 4}))))
  (testing "type args render, schema qualifies, granularity defaults to 1"
    (is (= [["ALTER TABLE `public`.`events` ADD INDEX `idx_ab` (`a`, `b`) TYPE set(100) GRANULARITY 1"]
            ["ALTER TABLE `public`.`events` MATERIALIZE INDEX `idx_ab`"]]
           (driver/compile-create-index :clickhouse "public" "events"
                                        {:name "idx_ab" :columns [{:name "a"} {:name "b"}] :type :set :type-args [100]})))))
