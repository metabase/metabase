(ns ^:mb/driver-tests metabase.driver.clickhouse.index-test
  "Tests for the ClickHouse index driver methods (Index Manager). ClickHouse exercises both lifecycles in one driver:
  the inline ORDER BY at both creation seams (the CTAS in `compile-transform` and the CREATE TABLE in `create-table!`)
  and the standalone data-skipping index (`compile-create-index`, which is multi-statement).

  The rendering/capability checks are pure and need no connection. `order-by-inlined-live-test` and
  `skip-index-live-test` run the seams against a real ClickHouse and read the result back out of `system.tables`
  (the sorting key) and `system.data_skipping_indices` (the skip index), so the indexes are verified to actually take
  effect on the physical table, not just to render."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.clickhouse :as clickhouse]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel feature-flags-test
  (testing "ClickHouse advertises both index lifecycles"
    (is (true? (driver/database-supports? :clickhouse :index/inline-create nil)))
    (is (true? (driver/database-supports? :clickhouse :index/standalone-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "ClickHouse advertises the inline order-by and the standalone skip-index, with form fields"
    (let [methods    (driver/supported-index-methods :clickhouse nil)
          type-field (->> (get-in methods [:skip-index :fields])
                          (filter #(= "type" (:name %)))
                          first)]
      (is (mr/validate :metabase.driver/supported-index-methods methods))
      (is (= {:order-by :inline, :skip-index :standalone}
             (update-vals methods :lifecycle)))
      (is (= ["columns"] (map :name (get-in methods [:order-by :fields]))))
      (is (= ["name" "columns" "type" "granularity"]
             (map :name (get-in methods [:skip-index :fields]))))
      (is (= #{"minmax" "bloom_filter"}
             (set (map :value (:options type-field))))))))

;;; --- inline ORDER BY at both creation seams ---

(def ^:private order-by-columns
  [["a" "Int64"] ["b" "Int64"]])

(def ^:private order-by-cases
  ;; The table/column identifiers come from the shared `:sql-jdbc` renderer (double-quoted); the ORDER BY columns are
  ;; rendered with ClickHouse `quote-name` (backticks), matching the driver's pre-existing ORDER BY rendering.
  ;; A sorting key gets `allow_nullable_key = 1`, since transform target columns are nullable and MergeTree otherwise
  ;; rejects a nullable sorting key. The unsorted `ORDER BY ()` case has no key, so it doesn't.
  [{:label        "order-by index sets the MergeTree sorting key and allows a nullable key"
    :indexes      [{:kind :order-by :columns [{:name "a"} {:name "b"}]}]
    :ctas         "CREATE TABLE `events` ORDER BY (`a`, `b`) SETTINGS allow_nullable_key = 1 AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" Int64, \"b\" Int64)\nENGINE = MergeTree\nORDER BY (`a`, `b`)\nSETTINGS replicated_deduplication_window = 0, allow_nullable_key = 1"}
   {:label        "no order-by index -> empty ORDER BY () (unsorted), no nullable-key setting"
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

;;; --- standalone data-skipping index ---

(deftest ^:parallel compile-create-index-test
  (testing "a skip-index renders ADD INDEX + MATERIALIZE INDEX (backfill existing parts)"
    (is (= [["ALTER TABLE `events` ADD INDEX `idx_a` (`a`) TYPE minmax GRANULARITY 4"]
            ["ALTER TABLE `events` MATERIALIZE INDEX `idx_a`"]]
           (driver/compile-create-index :clickhouse nil "events"
                                        {:name "idx_a" :columns [{:name "a"}] :type :minmax :granularity 4}))))
  (testing "bloom_filter (the other arg-free advertised type) renders TYPE bloom_filter, no args"
    (is (= [["ALTER TABLE `events` ADD INDEX `idx_a` (`a`) TYPE bloom_filter GRANULARITY 4"]
            ["ALTER TABLE `events` MATERIALIZE INDEX `idx_a`"]]
           (driver/compile-create-index :clickhouse nil "events"
                                        {:name "idx_a" :columns [{:name "a"}] :type :bloom_filter :granularity 4}))))
  (testing "type args render, schema qualifies, granularity defaults to 1"
    (is (= [["ALTER TABLE `public`.`events` ADD INDEX `idx_ab` (`a`, `b`) TYPE set(100) GRANULARITY 1"]
            ["ALTER TABLE `public`.`events` MATERIALIZE INDEX `idx_ab`"]]
           (driver/compile-create-index :clickhouse "public" "events"
                                        {:name "idx_ab" :columns [{:name "a"} {:name "b"}] :type :set :type-args [100]}))))
  (testing ":if-not-exists renders ADD INDEX IF NOT EXISTS"
    (is (= [["ALTER TABLE `events` ADD INDEX IF NOT EXISTS `idx_a` (`a`) TYPE minmax GRANULARITY 4"]
            ["ALTER TABLE `events` MATERIALIZE INDEX `idx_a`"]]
           (driver/compile-create-index :clickhouse nil "events"
                                        {:name "idx_a" :columns [{:name "a"}] :type :minmax :granularity 4
                                         :if-not-exists true}))))
  (testing "backticks and backslashes in identifiers are escaped, so a hostile name cannot break out"
    (is (= [["ALTER TABLE `events` ADD INDEX `idx\\`; DROP TABLE x; --` (`a\\\\\\`b`) TYPE minmax GRANULARITY 1"]
            ["ALTER TABLE `events` MATERIALIZE INDEX `idx\\`; DROP TABLE x; --`"]]
           (driver/compile-create-index :clickhouse nil "events"
                                        {:name "idx`; DROP TABLE x; --" :columns [{:name "a\\`b"}] :type :minmax})))))

;;; --------------------------------------- Live execute path ----------------------------------------

;; All tables here land in the connection's default database (created unqualified), so the catalog lookups filter on
;; database = "default". Tests are :synchronized, not :parallel: they create and drop tables in that shared database.

(defn- sorting-key
  "The MergeTree sorting key of `db`.`table` as ClickHouse reports it, e.g. \"a, b\" (or \"\" for an unsorted table)."
  [conn-spec db table]
  (-> (jdbc/query conn-spec
                  ["SELECT sorting_key FROM system.tables WHERE database = ? AND name = ?" db table])
      first :sorting_key))

(defn- only-skip-index
  "The single data-skipping index on `db`.`table` as `{:name ..., :type ..., :expr ..., :granularity ...}`, or nil when
  there is none. Looked up by table (not by name) so the assertion doesn't couple to how the index name is prefixed.
  Granularity is a UInt64, so coerce it to a long for a clean comparison against the literal we pass in."
  [conn-spec db table]
  (when-let [{:keys [name type expr granularity]}
             (first (jdbc/query conn-spec
                                [(str "SELECT name, type, expr, granularity FROM system.data_skipping_indices "
                                      "WHERE database = ? AND table = ?")
                                 db table]))]
    {:name name :type type :expr expr :granularity (long granularity)}))

(def ^:private live-order-by-cases
  "Each case drives one ORDER BY index through both live seams and asserts the sorting key the physical table reports."
  [{:label "order-by index sets the MergeTree sorting key" :slug "idx"
    :indexes  [{:kind :order-by :columns [{:name "a"} {:name "b"}]}]
    :expected "a, b"}
   {:label "no order-by index -> empty ORDER BY () (unsorted table)" :slug "noidx"
    :indexes  []
    :expected ""}])

(deftest ^:synchronized order-by-inlined-live-test
  (testing "an inlined ORDER BY actually sets the sorting key at both creation seams"
    (mt/test-driver :clickhouse
      (let [details   (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})
            conn-spec (sql-jdbc.conn/connection-details->spec :clickhouse details)]
        (mt/with-temp [:model/Database db {:engine :clickhouse, :details details}]
          (doseq [{:keys [label slug indexes expected]} live-order-by-cases]
            (testing label
              (let [ctas-table (str (gensym (str "mb_ob_ctas_" slug "_")))
                    crt-table  (str (gensym (str "mb_ob_crt_" slug "_")))
                    drop!      (fn [t] (jdbc/execute! conn-spec [(format "DROP TABLE IF EXISTS `%s`" t)]))]
                (testing "CTAS seam (compile-transform): run the rendered CTAS, read the sorting key back"
                  (drop! ctas-table)
                  (try
                    (let [[sql params] (driver/compile-transform
                                        :clickhouse
                                        {:output-table (keyword ctas-table)
                                         :query        {:query "SELECT 1 AS a, 2 AS b"}
                                         :indexes      indexes})]
                      (jdbc/execute! conn-spec (into [sql] params))
                      (is (= expected (sorting-key conn-spec "default" ctas-table))))
                    (finally (drop! ctas-table))))
                (testing "CREATE TABLE seam (create-table!): create the table, read the sorting key back"
                  (drop! crt-table)
                  (try
                    (driver/create-table! :clickhouse (:id db) (keyword crt-table)
                                          order-by-columns {:indexes indexes})
                    (is (= expected (sorting-key conn-spec "default" crt-table)))
                    (finally (drop! crt-table))))))))))))

(deftest ^:synchronized skip-index-live-test
  (testing "the standalone-create path runs ADD INDEX + MATERIALIZE INDEX and the data-skipping index actually exists"
    (mt/test-driver :clickhouse
      (let [details   (mt/dbdef->connection-details :clickhouse :db {:database-name "default"})
            conn-spec (sql-jdbc.conn/connection-details->spec :clickhouse details)
            table     (str (gensym "mb_skip_"))
            index     {:name "evt_minmax" :columns [{:name "a"}] :type :minmax :granularity 4}
            drop!     (fn [] (jdbc/execute! conn-spec [(format "DROP TABLE IF EXISTS `%s`" table)]))]
        (mt/with-temp [:model/Database db {:engine :clickhouse, :details details}]
          (drop!)
          (try
            (driver/create-table! :clickhouse (:id db) (keyword table) order-by-columns {})
            (is (nil? (only-skip-index conn-spec "default" table))
                "index absent before the standalone-create step")
            (testing "ADD INDEX + MATERIALIZE INDEX create the index with the expected type, columns, and granularity"
              (driver/execute-raw-queries! :clickhouse conn-spec
                                           (driver/compile-create-index :clickhouse nil table index))
              ;; ClickHouse normalizes the index expression in the catalog and reports the single column wrapped in
              ;; parens, so `system.data_skipping_indices.expr` reads back as "(a)" for the `(a)` we submitted.
              (is (= {:type "minmax" :expr "(a)" :granularity 4}
                     (-> (only-skip-index conn-spec "default" table)
                         (select-keys [:type :expr :granularity])))))
            (finally (drop!))))))))
