(ns metabase-enterprise.dependencies.result-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- table-query [table]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table)))))

(defn- card-query [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- measure-query [measure-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/aggregate (lib.metadata/measure mp measure-id)))))

(defn- native-card-query [card-id]
  (let [tag (str "#" card-id)]
    (-> (lib/native-query (mt/metadata-provider) (str "SELECT * FROM {{" tag "}}"))
        (lib/with-template-tags {tag {:type         :card
                                      :card-id      card-id
                                      :name         tag
                                      :display-name tag
                                      :id           (str (random-uuid))}}))))

(defn- run-jobs!
  "Compute the dependency graph, then re-derive the result metadata of the cards depending on stale entities."
  []
  (deps.test/synchronously-run-backfill!)
  (mt/with-premium-features #{:dependencies}
    (deps.result-metadata/update-result-metadata! 1000 60)))

(defn- column [card-id column-name]
  (some #(when (= column-name (:name %)) %)
        (t2/select-one-fn :result_metadata :model/Card :id card-id)))

(defn- stale? [entity-type entity-id]
  (t2/exists? :model/ResultMetadataStatus :entity_type entity-type :entity_id entity-id :stale true))

(defn- rename-column [metadata column-name display-name]
  (mapv #(cond-> % (= column-name (:name %)) (assoc :display_name display-name)) metadata))

(defmacro ^:private with-clean-statuses [& body]
  `(mt/with-premium-features #{:dependencies}
     (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/AnalysisFinding
                             :model/ResultMetadataStatus]
       (deps.test/do-with-immediate-hook-writes (fn [] ~@body)))))

(deftest model-metadata-edit-test
  (testing "editing a model's metadata re-derives the MBQL cards depending on it transitively, but not past a native card"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id}    {:type :model :dataset_query (table-query :orders)}
                     :model/Card {question-id :id} {:dataset_query (card-query model-id)}
                     :model/Card {nested-id :id}   {:dataset_query (card-query question-id)}
                     :model/Card {native-id :id}   {:dataset_query (native-card-query model-id)}]
        (mt/with-temp [:model/Card {after-native-id :id} {:dataset_query (card-query native-id)}]
          (run-jobs!)
          (let [native-total (column after-native-id "TOTAL")]
            (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card :id model-id)
                                                                              "TOTAL" "Grand total")})
            (is (stale? :card model-id))
            (run-jobs!)
            (is (= "Grand total" (:display_name (column question-id "TOTAL"))))
            (is (= "Grand total" (:display_name (column nested-id "TOTAL"))))
            (testing "the native card and the card depending on it are left alone"
              (is (= native-total (column after-native-id "TOTAL")))
              (is (not (t2/exists? :model/ResultMetadataStatus :entity_type :card :entity_id [:in [native-id after-native-id]]))))
            (is (not-any? #(stale? :card %) [model-id question-id nested-id]))))))))

(deftest invisible-metadata-change-test
  (testing "a result metadata change the dependents don't see, like a fingerprint, doesn't mark the card"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (t2/update! :model/Card card-id {:result_metadata (mapv #(dissoc % :fingerprint) metadata)})
          (is (not (stale? :card card-id)))
          (t2/update! :model/Card card-id {:result_metadata (rename-column metadata "TOTAL" "Grand total")})
          (is (stale? :card card-id)))))))

(deftest field-user-settings-test
  (testing "renaming a field re-derives the MBQL cards reading its table"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Grand total"}]
          (is (stale? :table (mt/id :orders)))
          (run-jobs!)
          (is (= "Grand total" (:display_name (column card-id "TOTAL"))))
          (is (not (stale? :table (mt/id :orders)))))))))

(deftest measure-chain-test
  (testing "changing a measure's definition re-derives a card using it through another measure"
    (with-clean-statuses
      (mt/with-temp [:model/Measure {inner-id :id} {:name       "Inner"
                                                    :table_id   (mt/id :orders)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (-> (table-query :orders) (lib/aggregate (lib/count)))}
                     :model/Measure {outer-id :id} {:name       "Outer"
                                                    :table_id   (mt/id :orders)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-query inner-id)}
                     :model/Card    {card-id :id}  {:dataset_query (measure-query outer-id)}]
        (run-jobs!)
        (let [column-name #(:name (first (t2/select-one-fn :result_metadata :model/Card :id card-id)))]
          (is (= "count" (column-name)))
          (t2/update! :model/Measure inner-id
                      {:definition (-> (table-query :orders)
                                       (lib/aggregate (lib/avg (lib.metadata/field (mt/metadata-provider)
                                                                                   (mt/id :orders :total)))))})
          (is (stale? :measure inner-id))
          (run-jobs!)
          (is (= "avg" (column-name))))))))

(deftest concurrent-update-test
  (testing "re-derived result metadata is not stored over a card updated after it was read"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (let [card     (t2/select-one :model/Card :id card-id)
              metadata (rename-column (:result_metadata card) "TOTAL" "Grand total")]
          (t2/update! :model/Card card-id {:name "Renamed"})
          (is (zero? (dependencies.db/set-card-result-metadata!
                      card-id (:updated_at card) metadata)))
          (is (= (:result_metadata card)
                 (t2/select-one-fn :result_metadata :model/Card :id card-id))))))))

(deftest clear-if-unchanged-test
  (testing "a status marked again while it was processed stays stale"
    (mt/with-model-cleanup [:model/ResultMetadataStatus]
      (let [card-id Integer/MAX_VALUE]
        (deps.result-metadata-status/mark-stale! :card card-id)
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (deps.result-metadata-status/mark-stale! :card card-id)
          (is (zero? (deps.result-metadata-status/clear-stale-if-unchanged! status)))
          (is (stale? :card card-id)))
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (is (= 1 (deps.result-metadata-status/clear-stale-if-unchanged! status)))
          (is (not (stale? :card card-id))))))))
