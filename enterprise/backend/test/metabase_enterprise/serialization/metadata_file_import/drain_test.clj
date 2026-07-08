(ns ^:synchronous metabase-enterprise.serialization.metadata-file-import.drain-test
  "Tests for the drain phase of the metadata file importer. Exercises
  `process-databases!` and the per-batch drain handlers directly against
  hand-built batches — bypassing the parser and orchestrator — and asserts
  the resulting staging-table contents.

  The production drain has two implementations: JDBC `executeBatch` for any
  appdb (the portable path) and PG `CopyManager` for PostgreSQL (the perf
  path). Per-batch tests below use the JDBC variant via the helpers
  [[drain-tables!]] / [[drain-fields!]] (each opens its own connection +
  PreparedStatement). The drain-paths-equivalence test below additionally
  asserts the PG-COPY variant produces the same staging-table state."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement)
   (org.postgresql PGConnection)
   (org.postgresql.copy CopyIn)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

(defn- staging-tables
  "Return the contents of `metabase_table_import` ordered by `source_id`.
  HoneySQL (not raw SQL) so the `schema` column is dialect-quoted correctly
  on MySQL/MariaDB, where `SCHEMA` is a reserved word."
  []
  (t2/query {:select   [:source_id :source_db_id :db_name :schema :name
                        :description :display_name :target_id]
             :from     [:metabase_table_import]
             :order-by [[:source_id :asc]]}))

(defn- staging-fields
  "Return the contents of `metabase_field_import` ordered by `source_id`."
  []
  (t2/query {:select   [:source_id :source_table_id :source_parent_id :source_fk_target_id
                        :name :base_type :database_type :effective_type :semantic_type
                        :coercion_strategy :description :nfc_path
                        :depth :target_id :target_table_id :target_parent_id :target_fk_target_id]
             :from     [:metabase_field_import]
             :order-by [[:source_id :asc]]}))

(defn- batch
  "Wrap rows in `[line-num row]` tuples as the parser would emit."
  [rows]
  (mapv (fn [i row] [(inc i) row]) (range) rows))

(defn- drain-tables!
  "Open a connection + PreparedStatement and drain `tbl-batch` via the JDBC
  variant. For tests that don't care which production path runs."
  [databases-by-source-id tbl-batch]
  (with-open [^Connection conn (.getConnection (mdb/data-source))
              ^PreparedStatement ps (.prepareStatement conn (p/tables-insert-sql))]
    (p/drain-tables-batch-jdbc! ps databases-by-source-id tbl-batch)))

(defn- drain-fields!
  "Open a connection + PreparedStatement and drain `fld-batch` via the JDBC
  variant. For tests that don't care which production path runs."
  [fld-batch]
  (with-open [^Connection conn (.getConnection (mdb/data-source))
              ^PreparedStatement ps (.prepareStatement conn (p/fields-insert-sql))]
    (p/drain-fields-batch-jdbc! ps fld-batch)))

;;; ============================== process-databases! ==============================

(deftest process-databases!-matches-by-name-and-engine-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}]
    (let [results (vec (p/process-databases!
                        (batch [{:id 100 :name db-name :engine "h2"}])))]
      (testing "matched result carries source-id (int), name, target-id"
        (is (= [{:source-id 100 :name db-name :target-id db-id :status :matched}]
               results))))))

(deftest process-databases!-no-match-test
  (let [results (vec (p/process-databases!
                      (batch [{:id 200 :name "nonexistent-db" :engine "h2"}])))]
    (testing "missing target produces :no-match (non-fatal)"
      (is (= 1 (count results)))
      (is (= :no-match (:status (first results))))
      (is (= 200 (:source-id (first results))))
      (is (= "nonexistent-db" (:name (first results)))))))

;;; ============================== tables drain ==============================

(deftest drain-tables-writes-source-and-target-columns-test
  (try
    (p/clear-staging-tables!)
    (let [databases-by-source-id {7 "warehouse-a" 9 "warehouse-b"}]
      (drain-tables!
       databases-by-source-id
       (batch [{:id 100 :db_id 7 :schema "public" :name "users"
                :description "user table"}
               {:id 101 :db_id 7 :schema nil :name "events"}
               {:id 200 :db_id 9 :schema "analytics" :name "purchases"}]))
      (let [rows (staging-tables)]
        (testing "three rows landed"
          (is (= 3 (count rows))))
        (testing "source ids and natural-key columns populated"
          (is (= [100 7 "warehouse-a" "public" "users" "user table"]
                 ((juxt :source_id :source_db_id :db_name :schema :name :description) (nth rows 0))))
          (is (= [101 7 "warehouse-a" nil "events" nil]
                 ((juxt :source_id :source_db_id :db_name :schema :name :description) (nth rows 1))))
          (is (= [200 9 "warehouse-b" "analytics" "purchases" nil]
                 ((juxt :source_id :source_db_id :db_name :schema :name :description) (nth rows 2)))))
        (testing "display_name pre-humanized at drain time"
          (is (= "Users"     (:display_name (nth rows 0))))
          (is (= "Events"    (:display_name (nth rows 1))))
          (is (= "Purchases" (:display_name (nth rows 2)))))
        (testing "target_id starts NULL — populated by the resolve step"
          (is (every? nil? (map :target_id rows))))))
    (finally (p/clear-staging-tables!))))

;;; ============================== fields drain ==============================

(deftest drain-fields-writes-all-shapes-test
  (try
    (p/clear-staging-tables!)
    (drain-fields!
     (batch
      ;; Flat field — no parent, no FK, no nfc_path
      [{:id 1000 :table_id 100 :name "id"
        :base_type "type/Integer" :database_type "int"}
       ;; Dictionary parent
       {:id 1001 :table_id 100 :name "data"
        :base_type "type/Dictionary" :database_type "json"}
       ;; nested leaf — parent_id + nfc_path
       {:id 1002 :table_id 100 :name "value"
        :base_type "type/Text" :database_type "text"
        :parent_id 1001
        :nfc_path ["data" "value"]}
       ;; unfolded leaf — nfc_path only, no parent_id
       {:id 1003 :table_id 100 :name "embedded → leaf"
        :base_type "type/Text" :database_type "text"
        :nfc_path ["embedded" "leaf"]}
       ;; FK source
       {:id 1004 :table_id 100 :name "account_fk"
        :base_type "type/Integer" :database_type "int"
        :fk_target_field_id 2000}
       ;; Field with effective_type set explicitly (≠ base_type case)
       {:id 1005 :table_id 100 :name "casted_value"
        :base_type "type/Text" :database_type "varchar"
        :effective_type "type/Text"
        :semantic_type "type/Email"
        :coercion_strategy "Coercion/UNIXSeconds->DateTime"
        :description "an email field"}]))
    (let [rows (staging-fields)
          by-id (into {} (map (juxt :source_id identity) rows))]
      (testing "six rows landed"
        (is (= 6 (count rows))))
      (testing "flat field has no parent or FK source ids"
        (let [r (by-id 1000)]
          (is (nil? (:source_parent_id r)))
          (is (nil? (:source_fk_target_id r)))
          (is (nil? (:nfc_path r)))))
      (testing "Dictionary parent row has no parent_id and no nfc_path"
        (let [r (by-id 1001)]
          (is (nil? (:source_parent_id r)))
          (is (nil? (:nfc_path r)))))
      (testing "nested leaf carries source_parent_id pointing at the parent's source_id"
        (let [r (by-id 1002)]
          (is (= 1001 (:source_parent_id r)))
          (is (= ["data" "value"] (json/decode (:nfc_path r))))))
      (testing "unfolded leaf has nfc_path but no source_parent_id"
        (let [r (by-id 1003)]
          (is (nil? (:source_parent_id r)))
          (is (= ["embedded" "leaf"] (json/decode (:nfc_path r))))))
      (testing "FK source carries source_fk_target_id"
        (let [r (by-id 1004)]
          (is (= 2000 (:source_fk_target_id r)))))
      (testing "optional payload columns roundtrip through staging"
        (let [r (by-id 1005)]
          (is (= "type/Text" (:effective_type r)))
          (is (= "type/Email" (:semantic_type r)))
          (is (= "Coercion/UNIXSeconds->DateTime" (:coercion_strategy r)))
          (is (= "an email field" (:description r)))))
      (testing "resolve outputs all start NULL"
        (doseq [{:keys [depth target_id target_table_id target_parent_id target_fk_target_id]} rows]
          (is (nil? depth))
          (is (nil? target_id))
          (is (nil? target_table_id))
          (is (nil? target_parent_id))
          (is (nil? target_fk_target_id)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== empty-batch behavior ==============================

(deftest drain-tables-empty-batch-is-noop-test
  (try
    (p/clear-staging-tables!)
    (drain-tables! {} (batch []))
    (is (zero? (count (staging-tables))))
    (finally (p/clear-staging-tables!))))

(deftest drain-fields-empty-batch-is-noop-test
  (try
    (p/clear-staging-tables!)
    (drain-fields! (batch []))
    (is (zero? (count (staging-fields))))
    (finally (p/clear-staging-tables!))))

;;; ============================== validation failures ==============================

(deftest drain-tables-rejects-rows-missing-required-keys-test
  (try
    (p/clear-staging-tables!)
    (testing "missing :id throws with :kind :invalid-input"
      (is (= :invalid-input
             (try
               (drain-tables! {} (batch [{:db_id 7 :name "no-id" :schema "public"}]))
               nil
               (catch clojure.lang.ExceptionInfo e (:kind (ex-data e)))))))
    (testing "no rows landed in staging on validation failure"
      (is (zero? (count (staging-tables)))))
    (finally (p/clear-staging-tables!))))

(deftest drain-fields-rejects-rows-missing-required-keys-test
  (try
    (p/clear-staging-tables!)
    (testing "missing :base_type throws with :kind :invalid-input"
      (is (= :invalid-input
             (try
               (drain-fields! (batch [{:id 1 :table_id 100 :name "x" :database_type "text"}]))
               nil
               (catch clojure.lang.ExceptionInfo e (:kind (ex-data e)))))))
    (finally (p/clear-staging-tables!))))

;;; ============================== Drain-path equivalence ==============================

(def ^:private equivalence-databases-by-source-id
  {7 "warehouse-a" 9 "warehouse-b"})

(def ^:private equivalence-table-batch-rows
  [{:id 100 :db_id 7 :schema "public"    :name "users"     :description "user table"}
   {:id 101 :db_id 7 :schema nil         :name "events"}
   {:id 200 :db_id 9 :schema "analytics" :name "purchases"}])

(def ^:private equivalence-field-batch-rows
  [{:id 1000 :table_id 100 :name "id"
    :base_type "type/Integer" :database_type "int"}
   {:id 1001 :table_id 100 :name "data"
    :base_type "type/Dictionary" :database_type "json"}
   {:id 1002 :table_id 100 :name "value"
    :base_type "type/Text" :database_type "text"
    :parent_id 1001 :nfc_path ["data" "value"]}
   {:id 1003 :table_id 100 :name "embedded → leaf"
    :base_type "type/Text" :database_type "text"
    :nfc_path ["embedded" "leaf"]}
   {:id 1004 :table_id 100 :name "account_fk"
    :base_type "type/Integer" :database_type "int"
    :fk_target_field_id 2000}
   {:id 1005 :table_id 100 :name "casted_value"
    :base_type "type/Text" :database_type "varchar"
    :effective_type "type/Text" :semantic_type "type/Email"
    :coercion_strategy "Coercion/UNIXSeconds->DateTime"
    :description "an email field"}])

(defn- snapshot-after! [drain-fn]
  (try
    (p/clear-staging-tables!)
    (drain-fn)
    {:tables (staging-tables) :fields (staging-fields)}
    (finally (p/clear-staging-tables!))))

(deftest drain-paths-produce-identical-staging-test
  (testing "the JDBC and PG-COPY drain paths produce the same staging-table
            contents for the same batch — guards against silent drift if
            one path's row-shaping diverges from the other. Only meaningful
            on a PG appdb (the JDBC variant runs on every appdb; the
            PG-COPY variant runs only on PG)."
    (when (= :postgres (mdb/db-type))
      (let [tbl-batch (batch equivalence-table-batch-rows)
            fld-batch (batch equivalence-field-batch-rows)
            jdbc      (snapshot-after!
                       (fn []
                         (with-open [^Connection conn (.getConnection (mdb/data-source))
                                     ^PreparedStatement tps (.prepareStatement conn (p/tables-insert-sql))
                                     ^PreparedStatement fps (.prepareStatement conn (p/fields-insert-sql))]
                           (p/drain-tables-batch-jdbc! tps equivalence-databases-by-source-id tbl-batch)
                           (p/drain-fields-batch-jdbc! fps fld-batch))))
            pg-copy   (snapshot-after!
                       (fn []
                         (with-open [^Connection conn (.getConnection (mdb/data-source))]
                           (let [^PGConnection pg-conn (.unwrap conn PGConnection)
                                 copy-mgr (.getCopyAPI pg-conn)
                                 t-ci     (.copyIn copy-mgr ^String p/tables-copy-sql)]
                             (try
                               (p/drain-tables-batch-pg-copy! t-ci equivalence-databases-by-source-id tbl-batch)
                               (finally (.endCopy ^CopyIn t-ci))))
                           (let [^PGConnection pg-conn (.unwrap conn PGConnection)
                                 copy-mgr (.getCopyAPI pg-conn)
                                 f-ci     (.copyIn copy-mgr ^String p/fields-copy-sql)]
                             (try
                               (p/drain-fields-batch-pg-copy! f-ci fld-batch)
                               (finally (.endCopy ^CopyIn f-ci)))))))]
        (is (= jdbc pg-copy)
            "JDBC drain produces the same staging rows as the PG-COPY drain")))))
