(ns metabase.queries.events.refresh-model-metadata-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.db :as queries.db]
   [metabase.queries.events.refresh-model-metadata]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest table-fields-added-refreshes-model-metadata-test
  (testing "GHY-4638: :event/table-fields-added adds the table's missing columns to its models and keeps model edits"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
      (mt/with-temp [:model/Card {model-id :id}    {:type :model, :dataset_query query}
                     :model/Card {question-id :id} {:type :question, :dataset_query query}]
        (let [all-names (map :name (t2/select-one-fn :result_metadata :model/Card :id model-id))
              stale     (fn [card-id]
                          (->> (t2/select-one-fn :result_metadata :model/Card :id card-id)
                               (take 2)
                               (mapv #(cond-> % (= "NAME" (:name %)) (assoc :display_name "Venue")))))]
          (t2/update! :model/Card model-id {:result_metadata (stale model-id)
                                            ;; a fixed past time, because now() can return the same value for two
                                            ;; updates in one transaction
                                            :updated_at      #t "2020-01-01T00:00:00Z"})
          (t2/update! :model/Card question-id {:result_metadata (stale question-id)})
          (let [updated-at (t2/select-one-fn :updated_at :model/Card :id model-id)]
            (events/publish-event! :event/table-fields-added {:table-id (mt/id :venues)})
            (testing "the model gains the columns it was missing"
              (let [metadata (t2/select-one-fn :result_metadata :model/Card :id model-id)]
                (is (= all-names (map :name metadata)))
                (testing "and keeps its edited display name"
                  (is (= "Venue" (:display_name (second metadata)))))))
            (testing "the model's updated_at does not change, because a sync is not a user edit"
              (is (= updated-at (t2/select-one-fn :updated_at :model/Card :id model-id)))))
          (testing "a question is left alone"
            (is (= ["ID" "NAME"]
                   (map :name (t2/select-one-fn :result_metadata :model/Card :id question-id))))))))))

(defn- stale-metadata!
  "Cut the result metadata of the Card with `card-id` down to its first two columns, and return those columns."
  [card-id]
  (let [metadata (vec (take 2 (t2/select-one-fn :result_metadata :model/Card :id card-id)))]
    (t2/update! :model/Card card-id {:result_metadata metadata})
    metadata))

(deftest table-fields-added-skips-models-with-joins-test
  (testing "GHY-4638: a model that joins another table keeps its metadata, because columns are matched by name"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                    (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :categories))
                                               [(lib/= (lib.metadata/field mp (mt/id :venues :category_id))
                                                       (lib.metadata/field mp (mt/id :categories :id)))])))]
      (mt/with-temp [:model/Card {model-id :id} {:type :model, :dataset_query query}]
        (let [stale (stale-metadata! model-id)]
          (events/publish-event! :event/table-fields-added {:table-id (mt/id :venues)})
          (is (= stale (t2/select-one-fn :result_metadata :model/Card :id model-id))))))))

(deftest table-fields-added-keeps-concurrent-query-edit-test
  (testing "GHY-4638: when the model's query changes while its metadata is refreshed, the refresh does not write"
    (let [mp      (mt/metadata-provider)
          query   (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          refresh (mt/original-fn #'card.metadata/refresh-metadata)]
      (mt/with-temp [:model/Card {model-id :id} {:type :model, :dataset_query query}]
        (stale-metadata! model-id)
        (let [after-edit (atom nil)]
          (mt/with-dynamic-fn-redefs [card.metadata/refresh-metadata
                                      (fn [card opts]
                                        ;; the user's save, landing while the handler infers
                                        (t2/update! :model/Card model-id {:dataset_query (lib/limit query 10)})
                                        (reset! after-edit (t2/select-one-fn :result_metadata :model/Card :id model-id))
                                        (refresh card opts))]
            (events/publish-event! :event/table-fields-added {:table-id (mt/id :venues)}))
          (is (= @after-edit (t2/select-one-fn :result_metadata :model/Card :id model-id))))))))

(deftest table-fields-added-keeps-concurrent-metadata-edit-test
  (testing "GHY-4638: when the model's metadata changes while it is refreshed, the refresh does not overwrite the edit"
    (let [mp      (mt/metadata-provider)
          query   (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          refresh (mt/original-fn #'card.metadata/refresh-metadata)]
      (mt/with-temp [:model/Card {model-id :id} {:type :model, :dataset_query query}]
        (let [edited (mapv #(assoc % :display_name "Edited") (stale-metadata! model-id))]
          (mt/with-dynamic-fn-redefs [card.metadata/refresh-metadata
                                      (fn [card opts]
                                        ;; the user's save, landing while the handler infers
                                        (t2/update! :model/Card model-id {:result_metadata edited})
                                        (refresh card opts))]
            (events/publish-event! :event/table-fields-added {:table-id (mt/id :venues)}))
          (is (= edited (t2/select-one-fn :result_metadata :model/Card :id model-id))))))))

(deftest table-fields-added-handler-does-not-throw-test
  (testing "GHY-4638: a failure in the handler does not reach sync, which would skip the rest of the Table's sync"
    (mt/with-dynamic-fn-redefs [queries.db/unarchived-models-for-table (fn [_] (throw (ex-info "boom" {})))]
      (is (some? (events/publish-event! :event/table-fields-added {:table-id (mt/id :venues)}))))))

(deftest table-fields-added-published-only-when-table-gains-fields-test
  (testing "GHY-4638: the first sync of a Table publishes no event, because no model can use the Table yet"
    (mt/test-driver :h2
      (let [published (atom [])
            publish   events/publish-event!]
        (with-redefs [events/publish-event! (fn [topic event]
                                              (when (= :event/table-fields-added topic)
                                                (swap! published conj event))
                                              (publish topic event))]
          (mt/with-temp-test-data [["gains_fields"
                                    [{:field-name "name", :base-type :type/Text}]
                                    [["a"]]]]
            (is (= [] @published))
            (testing "a later sync that finds a new column publishes one event for the Table"
              (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                             ["ALTER TABLE \"GAINS_FIELDS\" ADD COLUMN \"EXTRA\" VARCHAR;"])
              (sync/sync-database! (mt/db))
              (is (= [{:table-id (mt/id :gains_fields)}] @published)))))))))
