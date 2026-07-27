(ns metabase-enterprise.semantic-search.repair-test
  "Integration tests for repair-index! functionality."
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- gate-table-contents
  "Query all documents in the gate table, returning them as maps"
  [pgvector gate-table-name]
  (jdbc/execute! pgvector
                 (-> {:select [:id :model :model_id :document :document_hash :updated_at :gated_at]
                      :from   [(keyword gate-table-name)]
                      :order-by [:gated_at :id]}
                     (sql/format :quoted true))
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- create-test-document
  "Create a test document with the given model, id, and name"
  [model id name]
  {:model           model
   :id              (str id)
   :name            name
   :searchable_text name
   :embeddable_text name
   :updated_at      (t/instant)
   :creator_id      1})

(defn- tombstone?
  [gate-entry]
  (and
   (map? gate-entry)
   (nil? (:document gate-entry))
   (nil? (:document_hash gate-entry))))

(defn- gate-entry-by-id
  [gate-contents id]
  (some #(when (= (:id %) id) %) gate-contents))

(defn- clear-gate-table!
  "Clear all entries from the gate table to ensure clean test state"
  [pgvector gate-table-name]
  (jdbc/execute! pgvector
                 (-> {:delete-from [(keyword gate-table-name)]}
                     (sql/format :quoted true))))

(deftest repair-index-integration-test
  (testing "repair-index! properly handles document additions and deletions via gate table"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :mock-indexed}
        (let [pgvector       (semantic.env/get-pgvector-datasource!)
              index-metadata (semantic.env/get-index-metadata)
              gate-table     (:gate-table-name index-metadata)
              _              (clear-gate-table! pgvector gate-table)
              initial-docs   [(create-test-document "card" 1 "Dog Training Guide")
                              (create-test-document "card" 2 "Cat Behavior Study")
                              (create-test-document "dashboard" 3 "Animal Stats")]]
          (semantic.core/update-index! initial-docs)
          (semantic.tu/index-all!)
          ;; Retain card 1, add card 4 and dashboard 5, and tombstone the missing card 2 and dashboard 3.
          (let [modified-docs [(create-test-document "card" 1 "Dog Training Guide")
                               (create-test-document "card" 4 "Bird Watching Tips")
                               (create-test-document "dashboard" 5 "Wildlife Dashboard")]]
            (semantic.core/repair-index! modified-docs)
            (let [gate-contents       (gate-table-contents pgvector gate-table)
                  new-card-entry      (gate-entry-by-id gate-contents "card_4")
                  new-dashboard-entry (gate-entry-by-id gate-contents "dashboard_5")]
              (testing "new documents should be gated for insertion"
                (is (some? (:document new-card-entry)) "New card should exist in gate table")
                (is (some? (:document new-dashboard-entry)) "New dashboard should exist in gate table"))
              (testing "missing documents should be gated for deletion"
                (let [deleted-card-entry      (gate-entry-by-id gate-contents "card_2")
                      deleted-dashboard-entry (gate-entry-by-id gate-contents "dashboard_3")]
                  (is (tombstone? deleted-card-entry) "Deleted card should be a tombstone in gate table")
                  (is (tombstone? deleted-dashboard-entry) "Deleted dashboard should be a tombstone in gate table"))))))))))

(deftest repair-index-initializes-when-missing-test
  (testing "repair-index! initializes the index when none is active, so runtime activation backfills"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :blank}
        ;; with-redefs mirrors the :mock-initialized bindings, which include non-fn values that
        ;; with-dynamic-fn-redefs cannot proxy.
        (with-redefs [semantic.embedding/get-configured-model        (fn [] semantic.tu/mock-embedding-model)
                      semantic.index-metadata/default-index-metadata semantic.tu/mock-index-metadata
                      semantic.index/model-table-suffix              semantic.tu/mock-table-suffix]
          (let [pgvector       (semantic.env/get-pgvector-datasource!)
                index-metadata (semantic.env/get-index-metadata)]
            (is (nil? (semantic.index-metadata/get-active-index-state pgvector index-metadata)))
            (semantic.core/repair-index! [(create-test-document "card" 1 "Dog Training Guide")])
            (is (some? (semantic.index-metadata/get-active-index-state pgvector index-metadata)))
            (testing "the supplied documents are gated for backfill"
              (let [gate-contents (gate-table-contents pgvector (:gate-table-name index-metadata))]
                (is (some? (:document (gate-entry-by-id gate-contents "card_1"))))))))))))

(deftest count-stale-orphans-test
  ;; Hermetic: the fn only takes table names, so ad-hoc tables stand in for the index/gate/repair tables.
  (when semantic.db.datasource/db-url
    (let [pgvector (semantic.db.datasource/ensure-initialized-data-source!)
          suffix   (System/nanoTime)
          index-t  (str "count_orphans_index_" suffix)
          gate-t   (str "count_orphans_gate_" suffix)
          repair-t (str "count_orphans_repair_" suffix)
          dlq-t    (str "count_orphans_dlq_" suffix)
          exec!    (fn [q] (jdbc/execute! pgvector [q]))
          count!   (fn [watermark]
                     (semantic.repair/count-stale-orphans pgvector index-t gate-t repair-t dlq-t watermark))
          wm-ts    (t/offset-date-time "2026-01-01T12:00:00Z")]
      (try
        (exec! (format "CREATE TABLE \"%s\" (model text, model_id text)" index-t))
        (exec! (format (str "CREATE TABLE \"%s\" (id text, model text, model_id text, "
                            "document_hash text, gated_at timestamptz)")
                       gate-t))
        (exec! (format "CREATE TABLE \"%s\" (model text, model_id text)" repair-t))
        (exec! (format "CREATE TABLE \"%s\" (gate_id text, error_gated_at timestamptz)" dlq-t))
        ;; candidate set: card 1 only
        (exec! (format "INSERT INTO \"%s\" VALUES ('card','1')" repair-t))
        ;; index rows: 1 = still a candidate, 2 = tombstone behind the watermark (stale), 3 = tombstone ahead
        ;; of it (indexer backlog), 4 = gate row gone (survived tombstone cleanup), 5 = live gate row,
        ;; 6/7 = tombstones AT the watermark timestamp with gate ids on either side of the watermark id
        (exec! (format (str "INSERT INTO \"%s\" VALUES "
                            "('card','1'),('card','2'),('card','3'),('card','4'),('card','5'),"
                            "('card','6'),('card','7')")
                       index-t))
        (exec! (format (str "INSERT INTO \"%s\" VALUES "
                            "('card_2', 'card','2', NULL,   timestamptz '2026-01-01 11:00:00+00'), "
                            "('card_3', 'card','3', NULL,   timestamptz '2026-01-01 13:00:00+00'), "
                            "('card_5', 'card','5', 'hash', timestamptz '2026-01-01 11:00:00+00'), "
                            "('card_6', 'card','6', NULL,   timestamptz '2026-01-01 12:00:00+00'), "
                            "('card_7', 'card','7', NULL,   timestamptz '2026-01-01 12:00:00+00')")
                       gate-t))
        ;; card 2 is a current failed delete and remains pending; card 3's obsolete DLQ generation must not
        ;; hide it once the watermark passes its current tombstone.
        (exec! (format (str "INSERT INTO \"%s\" VALUES "
                            "('card_2', timestamptz '2026-01-01 11:00:00+00'), "
                            "('card_3', timestamptz '2026-01-01 10:00:00+00')")
                       dlq-t))
        (testing "counts non-candidates whose tombstone the (gated_at, id) watermark has passed, or whose
                 gate row is gone"
          ;; Watermark id between card_6 and card_7: cards 4 (gate row gone) and 6 (same timestamp, earlier
          ;; id) count. Card 2 has a current DLQ retry; cards 3 and 7 remain ahead of the watermark.
          (is (= 2 (count! {:indexer_last_seen wm-ts :indexer_last_seen_id "card_6a"}))))
        (testing "a tombstone ahead of the watermark is in-flight backlog, not garbage"
          (is (= 4 (count! {:indexer_last_seen (t/plus wm-ts (t/hours 2)) :indexer_last_seen_id ""}))
              "once the watermark passes them, the same tombstones count"))
        (testing "nil watermark (indexer never ran) counts no tombstones, only gate-row-gone orphans"
          (is (= 1 (count! nil))))
        (testing "a timestamp-only watermark (no id) treats same-timestamp tombstones as pending"
          (is (= 1 (count! {:indexer_last_seen wm-ts}))
              "cards 6/7 are pending by watermark and card 2 by DLQ; only gate-row-gone card 4 counts"))
        (testing "a query failure returns nil rather than failing the repair run"
          (is (nil? (semantic.repair/count-stale-orphans pgvector "no_such_table" gate-t repair-t dlq-t
                                                         {:indexer_last_seen wm-ts}))))
        (finally
          (exec! (format "DROP TABLE IF EXISTS \"%s\", \"%s\", \"%s\", \"%s\""
                         index-t gate-t repair-t dlq-t)))))))

(deftest count-stale-orphans-propagates-interruption-test
  (mt/with-dynamic-fn-redefs
    [jdbc/execute-one! (fn [& _] (throw (InterruptedException.)))]
    (is (thrown? InterruptedException
                 (semantic.repair/count-stale-orphans
                  ::pgvector "index" "gate" "repair" "dlq" {})))))

(deftest repair-table-cleanup-test
  (testing "The repair table gets cleaned up properly at the end of a repair-index! job"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :mock-indexed}
        (let [pgvector       (semantic.env/get-pgvector-datasource!)
              index-metadata semantic.tu/mock-index-metadata
              gate-table     (:gate-table-name index-metadata)
              initial-docs   [(create-test-document "card" 6 "Dog Training Guide")]]
          (semantic.core/update-index! initial-docs)
          (semantic.tu/index-all!)
          (testing "repair table is cleaned up after successful repair"
            (let [test-repair-table-name "repair_table_cleanup_test"]
              (mt/with-dynamic-fn-redefs [semantic.repair/repair-table-name (constantly test-repair-table-name)]
                (semantic.core/repair-index! [(create-test-document "card" 7 "New Test Card")])
                (let [gate-contents (gate-table-contents pgvector gate-table)]
                  (is (tombstone? (gate-entry-by-id gate-contents "card_6")))
                  (is (some? (gate-entry-by-id gate-contents "card_7")))
                  (is (not (semantic.util/table-exists? pgvector test-repair-table-name))
                      "Repair table should be cleaned up after repair-index! completes"))))))))))
