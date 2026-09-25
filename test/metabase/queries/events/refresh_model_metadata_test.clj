(ns metabase.queries.events.refresh-model-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.events.refresh-model-metadata]
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
