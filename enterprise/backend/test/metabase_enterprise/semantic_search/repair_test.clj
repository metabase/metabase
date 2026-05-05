(ns metabase-enterprise.semantic-search.repair-test
  "Integration tests for repair-index! functionality."
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.env :as semantic.env]
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

            ;; Ensure repair-index! brings index into consistency with new documents et.
            ;; Note: card 2 and dashboard 3 are missing - should be deleted
          (let [modified-docs [(create-test-document "card" 1 "Dog Training Guide")        ; existing - should remain
                               (create-test-document "card" 4 "Bird Watching Tips")        ; new - should be added
                               (create-test-document "dashboard" 5 "Wildlife Dashboard")]] ; new - should be added
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
              (with-redefs [semantic.repair/repair-table-name (constantly test-repair-table-name)]
                (semantic.core/repair-index! [(create-test-document "card" 7 "New Test Card")])

                (let [gate-contents (gate-table-contents pgvector gate-table)]
                  (is (tombstone? (gate-entry-by-id gate-contents "card_6")))
                  (is (some? (gate-entry-by-id gate-contents "card_7")))
                  (is (not (semantic.util/table-exists? pgvector test-repair-table-name))
                      "Repair table should be cleaned up after repair-index! completes"))))))))))
