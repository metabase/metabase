(ns metabase-enterprise.serialization.metadata-file-import.drain-test
  "Tests for the drain phase of the metadata file importer. Exercises
  `process-databases!`, `drain-tables-batch!`, and `drain-fields-batch!`
  directly against hand-built batches — bypassing the parser and orchestrator
  — and asserts the resulting staging-table contents."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fn [thunk]
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

(defn- staging-tables
  "Return the contents of `metabase_table_import` ordered by `source_id`."
  []
  (t2/query "SELECT source_id, source_db_id, db_name, schema, name, description, display_name, target_id
             FROM metabase_table_import ORDER BY source_id"))

(defn- staging-fields
  "Return the contents of `metabase_field_import` ordered by `source_id`."
  []
  (t2/query "SELECT source_id, source_table_id, source_parent_id, source_fk_target_id,
                    name, base_type, database_type, effective_type, semantic_type,
                    coercion_strategy, description, nfc_path,
                    depth, target_id, target_table_id, target_parent_id, target_fk_target_id
             FROM metabase_field_import ORDER BY source_id"))

(defn- batch
  "Wrap rows in `[line-num row]` tuples as the parser would emit."
  [rows]
  (mapv (fn [i row] [(inc i) row]) (range) rows))

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

;;; ============================== drain-tables-batch! ==============================

(deftest drain-tables-writes-source-and-target-columns-test
  (try
    (p/clear-staging-tables!)
    (let [databases-by-source-id {7 "warehouse-a" 9 "warehouse-b"}]
      (p/drain-tables-batch!
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

;;; ============================== drain-fields-batch! ==============================

(deftest drain-fields-writes-all-shapes-test
  (try
    (p/clear-staging-tables!)
    (p/drain-fields-batch!
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
    (p/drain-tables-batch! {} (batch []))
    (is (zero? (count (staging-tables))))
    (finally (p/clear-staging-tables!))))

(deftest drain-fields-empty-batch-is-noop-test
  (try
    (p/clear-staging-tables!)
    (p/drain-fields-batch! (batch []))
    (is (zero? (count (staging-fields))))
    (finally (p/clear-staging-tables!))))

;;; ============================== validation failures ==============================

(deftest drain-tables-rejects-rows-missing-required-keys-test
  (try
    (p/clear-staging-tables!)
    (testing "missing :id throws with :kind :invalid_input"
      (is (= :invalid_input
             (try
               (p/drain-tables-batch! {} (batch [{:db_id 7 :name "no-id" :schema "public"}]))
               nil
               (catch clojure.lang.ExceptionInfo e (:kind (ex-data e)))))))
    (testing "no rows landed in staging on validation failure"
      (is (zero? (count (staging-tables)))))
    (finally (p/clear-staging-tables!))))

(deftest drain-fields-rejects-rows-missing-required-keys-test
  (try
    (p/clear-staging-tables!)
    (testing "missing :base_type throws with :kind :invalid_input"
      (is (= :invalid_input
             (try
               (p/drain-fields-batch! (batch [{:id 1 :table_id 100 :name "x" :database_type "text"}]))
               nil
               (catch clojure.lang.ExceptionInfo e (:kind (ex-data e)))))))
    (finally (p/clear-staging-tables!))))
