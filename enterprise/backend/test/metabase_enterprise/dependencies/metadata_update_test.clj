(ns metabase-enterprise.dependencies.metadata-update-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.events :as deps.events]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.metadata-update :as deps.metadata-update]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn assert-traverses-grandchild [{:keys [grandchild-dependency-type grandchild-data should-traverse? should-include?]}]
  (let [mp (mt/metadata-provider)
        query (->> (mt/id :products)
                   (lib.metadata/table mp)
                   (lib/query mp))
        grandchild-model (deps.dependency-types/dependency-type->model grandchild-dependency-type)]
    (mt/with-temp [:model/Card {parent-id :id} {:dataset_query query}
                   :model/Card {child-id :id} {:dataset_query query}
                   grandchild-model {grandchild-id :id} grandchild-data
                   :model/Card {great-grandchild-id :id} {:dataset_query query}
                   :model/Dependency _ {:from_entity_type :card
                                        :from_entity_id child-id
                                        :to_entity_type :card
                                        :to_entity_id parent-id}
                   :model/Dependency _ {:from_entity_type grandchild-dependency-type
                                        :from_entity_id grandchild-id
                                        :to_entity_type :card
                                        :to_entity_id child-id}
                   :model/Dependency _ {:from_entity_type :card
                                        :from_entity_id great-grandchild-id
                                        :to_entity_type grandchild-dependency-type
                                        :to_entity_id grandchild-id}]
      (is (= (cond-> #{child-id}
               should-include? (conj grandchild-id)
               should-traverse? (conj great-grandchild-id))
             (set (#'deps.metadata-update/dependent-mbql-cards
                   (#'deps.metadata-update/mbql-graph mp)
                   :card parent-id)))))))

(deftest ^:parallel dependent-mbql-cards-traverses-cards-test
  (testing "dependent-mbql-cards looks through card dependencies"
    (let [mp (mt/metadata-provider)
          query (->> (mt/id :products)
                     (lib.metadata/table mp)
                     (lib/query mp))]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query query}
        :should-traverse? true
        :should-include? true}))))

(deftest ^:parallel dependent-mbql-cards-stops-on-native-cards-test
  (testing "dependent-mbql-cards stops when it reaches a native card"
    (let [mp (mt/metadata-provider)
          native-query (lib/native-query mp "select * from orders")]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query native-query}}))))

(deftest ^:parallel dependent-mbql-cards-stops-on-snippets-test
  (testing "dependent-mbql-cards stops when it reaches a snippet"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :snippet
      :grandchild-data {:name "test snippet"
                        :content "SELECT 1"}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-transforms-test
  (testing "dependent-mbql-cards stops when it reaches a transform"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :transform
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-dashboards-test
  (testing "dependent-mbql-cards stops when it reaches a dashboard"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :dashboard
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-documents-test
  (testing "dependent-mbql-cards stops when it reaches a document"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :document
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-traverses-through-segments-test
  (testing "dependent-mbql-cards traverses through segments"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :segment
      :grandchild-data {}
      :should-traverse? true})))

(deftest ^:parallel dependent-mbql-cards-traverses-through-measures-test
  (testing "dependent-mbql-cards traverses through measures"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :measure
      :grandchild-data {}
      :should-traverse? true})))

(deftest ^:sequential card-update-updates-child-metadata-test
  (testing "card updates update child card metadata"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              orders-id (mt/id :orders)
              products (lib.metadata/table mp products-id)
              orders (lib.metadata/table mp orders-id)]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (is (= #{8}
                   (t2/select-fn-set (comp count :result_metadata)
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id [:in [parent-id child-id grandchild-id]])))
            (t2/update! :model/Card parent-id {:dataset_query (lib/query mp orders)})
            (events/publish-event! :event/card-update
                                   {:object (assoc parent-card :dataset_query (lib/query mp orders))
                                    :previous-object parent-card
                                    :user-id api/*current-user-id*})
            (is (= #{9}
                   (t2/select-fn-set (comp count :result_metadata)
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id [:in [parent-id child-id grandchild-id]])))))))))

(deftest ^:sequential native-card-update-does-not-update-children-test
  (testing "native card updates do not update children"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              native-query (lib/native-query mp "select * from orders")]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}]
            (t2/update! :model/Card child-id {:result_metadata nil})
            (events/publish-event! :event/card-update
                                   {:object (assoc parent-card :dataset_query native-query)
                                    :previous-object parent-card
                                    :user-id api/*current-user-id*})
            (is (= nil
                   (t2/select-one-fn :result_metadata
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id child-id)))))))))

(deftest ^:sequential model-update-passes-down-new-values-test
  (testing "model updates pass down new result metadata"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))

                                                     :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-result-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-result-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-result-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= #{[child-id "new-name"] [grandchild-id "new-name"]}
                     (t2/select-fn-set (juxt :id #(get-in % [:result_metadata 0 :display_name]))
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id [:in [child-id grandchild-id]]))))))))))

(deftest ^:sequential model-update-respects-child-overrides-test
  (testing "model updates respect child metadata edits"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))
                                                                    :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-parent-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")
                  new-child-metadata (assoc-in (:result_metadata child-card)
                                               [0 :display_name]
                                               "child-name")
                  new-grandchild-metadata (assoc-in (:result_metadata child-card)
                                                    [0 :display_name]
                                                    "grandchild-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-parent-metadata})
              (t2/update! :model/Card child-id {:result_metadata new-child-metadata})
              (t2/update! :model/Card grandchild-id {:result_metadata new-grandchild-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-parent-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= #{[child-id "child-name"] [grandchild-id "grandchild-name"]}
                     (t2/select-fn-set (juxt :id #(get-in % [:result_metadata 0 :display_name]))
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id [:in [child-id grandchild-id]]))))))))))

(deftest ^:sequential model-update-stops-recursing-when-child-metadata-is-unchanged-test
  (testing "model updates stop recursing when they hit a child whose metadata didn't change"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))
                                                                    :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-parent-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")
                  new-child-metadata (-> (:result_metadata child-card)
                                         (assoc-in [0 :display_name]
                                                   "child-name")
                                         (assoc-in [0 :lib/model-display-name]
                                                   "new-name"))]
              (t2/update! :model/Card parent-id {:result_metadata new-parent-metadata})
              (t2/update! :model/Card child-id {:result_metadata new-child-metadata})
              (t2/update! :model/Card grandchild-id {:result_metadata nil})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-parent-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= nil
                     (t2/select-one-fn #(get-in % [:result_metadata 0 :display_name])
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id grandchild-id))))))))))

(defn- with-syncable-db! [thunk]
  (mt/with-premium-features #{:dependencies}
    (one-off-dbs/with-blank-db
      ;; Step 1: Create a table with two columns
      (doseq [statement ["CREATE TABLE \"test_table\" (\"id\" INTEGER PRIMARY KEY, \"filter_col\" VARCHAR);"
                         "INSERT INTO \"test_table\" (\"id\", \"filter_col\") VALUES (1, 'value1'), (2, 'value2');"]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))

      ;; Sync the database to pick up the new table
      (sync/sync-database! (mt/db))

      (let [table-id        (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "test_table")
            filter-field-id (t2/select-one-fn :id :model/Field :table_id table-id :name "filter_col")
            ;; Step 2: Create a card with a filter on filter_col
            mp              (lib-be/application-database-metadata-provider (mt/id))
            table           (lib.metadata/table mp table-id)
            filter-field    (lib.metadata/field mp filter-field-id)
            query           (-> (lib/query mp table)
                                (lib/filter (lib/= filter-field "value1")))]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                  :database_id (mt/id)}]
          ;; Create the dependency manually
          (t2/insert! :model/Dependency {:from_entity_type :card
                                         :from_entity_id card-id
                                         :to_entity_type :table
                                         :to_entity_id table-id})

          ;; Step 3: Run analysis - should succeed with no errors
          (let [card (t2/select-one :model/Card card-id)]
            ;; NOTE: The metadata provider caches must be small here - if the cache spans a sync it will see
            ;; old values after the sync!
            (lib-be/with-metadata-provider-cache
              (deps.findings/upsert-analysis! card)))

          (testing "Initial analysis succeeds"
            (is (true?
                 (t2/select-one-fn :result :model/AnalysisFinding
                                   :analyzed_entity_type :card
                                   :analyzed_entity_id card-id)))
            (is (empty? (deps.analysis-finding-error/errors-for-entity :card card-id))))

          ;; Backdate the analysis timestamp and table/field updated_at so
          ;; synced-db->direct-dependents-of-changed-tables will detect it as stale (analyzed_at < field.updated_at)
          ;; after a new sync makes an edit.
          ;; This is necessary because within a transaction, now() returns the same value, so the initial analysis and
          ;; the field update from sync would have identical timestamps.
          (let [old-time (t/minus (t/offset-date-time) (t/hours 1))]
            (t2/update! :model/AnalysisFinding
                        {:analyzed_entity_type :card :analyzed_entity_id card-id}
                        {:analyzed_at old-time})
            (t2/update! :model/Field :table_id table-id
                        {:updated_at old-time})
            (t2/update! :model/Table :id table-id
                        {:updated_at old-time}))

          ;; Setup complete: Now call the thunk for the actual test run.
          (thunk {:db-id           (:id (mt/db))
                  :card-id         card-id
                  :table-id        table-id
                  :filter-field-id filter-field-id}))))))

;; Integration test that a real DB sync triggers re-analysis of an updated table.
(deftest ^:sequential sync-removed-column-triggers-reanalysis-test
  (testing "When sync detects a removed column, re-analyzing the card shows errors"
    (with-syncable-db!
      (fn [{:keys [card-id filter-field-id]}]
        (let [initial-analysis-time (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                                                      :analyzed_entity_type :card
                                                      :analyzed_entity_id card-id)]
          ;; Step 4: Remove the column used in the filter
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])

          ;; Step 5: Re-sync the database. The sync-end event will detect the stale analysis
          ;; (because analyzed_at < field.updated_at) and trigger re-analysis.
          (sync/sync-database! (mt/db))

          ;; Verify the field is now inactive
          (testing "Field is marked inactive after sync"
            (is (false? (t2/select-one-fn :active :model/Field :id filter-field-id))))

          ;; Step 6 & 7: The sync-end event should have triggered re-analysis.
          ;; Check that analysis now fails with missing column error.
          (testing "Re-analysis detects the missing column"
            (let [finding (t2/select-one :model/AnalysisFinding
                                         :analyzed_entity_type :card
                                         :analyzed_entity_id card-id)]
              (is (some? finding) "Analysis finding should exist")
              (is (false? (:result finding)) "Analysis should fail")
              (is (not= initial-analysis-time (:analyzed_at finding))
                  "Analysis should have been re-run"))

            (let [errors (deps.analysis-finding-error/errors-for-entity :card card-id)]
              (is (seq errors) "Should have analysis errors")
              (is (some #(= :missing-column (:error_type %)) errors)
                  "Should have a missing-column error"))))))))

;; Integration test that a DB sync which doesn't change anything about a table does not trigger re-analysis of all
;; cards which depend on that table.
(deftest ^:sequential sync-without-changes-does-not-trigger-reanalysis-test
  (testing "When sync makes no changes to a table or its fields, the card is not re-analyzed"
    (with-syncable-db!
      (fn [{:keys [card-id db-id filter-field-id table-id]}]
        (let [initial-analysis-time (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                                                      :analyzed_entity_type :card
                                                      :analyzed_entity_id card-id)
              db-deps-checked       (atom [])
              original-deps-check   @#'deps.events/synced-db->direct-dependents-of-changed-tables
              table-before          (into {} (t2/select-one :model/Table :id table-id))
              filter-field-before   (into {} (t2/select-one :model/Field :id filter-field-id))]
          ;; Re-sync the database, having made no changes to it.
          (with-redefs [deps.events/synced-db->direct-dependents-of-changed-tables
                        (fn [db-id]
                          (u/prog1 (original-deps-check db-id)
                            (swap! db-deps-checked conj [db-id <>])))]
            (sync/sync-database! (mt/db)))

          (testing "sync doesn't update tables or fields that haven't changed"
            (let [table-after        (into {} (t2/select-one :model/Table :id table-id))
                  filter-field-after (into {} (t2/select-one :model/Field :id filter-field-id))]
              (is (= table-before table-after))
              (is (= filter-field-before filter-field-after))))

          (testing "the DB is were checked for tables that need deps updates, but none were found"
            (is (=? [[db-id empty?]]
                    @db-deps-checked)))

          (testing "No re-analysis was done, the analysis for the card is ~1 hour ago"
            (let [finding (t2/select-one :model/AnalysisFinding
                                         :analyzed_entity_type :card
                                         :analyzed_entity_id card-id)]
              (is (some? finding) "Analysis finding should exist")
              (is (true? (:result finding)) "Analysis should be a success")
              (is (= initial-analysis-time (:analyzed_at finding))
                  "Analysis should not have been re-run"))))))))
