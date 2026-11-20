(ns metabase-enterprise.data-testing.serialization
  "The SerDes of saved tests, stored in the directory of the file of the subject they test."
  (:require
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn- subject-storage-paths
  "The storage path of each of `tests`, saved tests whose `subject-key` holds the entity id of a row of
  `subject-model`: the path of the subject's file, as a directory, then the test's name. `fk-models` maps each column of
  the subject that the subject's storage path reads to the model the column references."
  [tests subject-model subject-key fk-models]
  (let [rows     (vals (serialization/rows-by-refs subject-model
                                                   (into #{} (keep subject-key) tests)
                                                   (into [:entity_id :name] (keys fk-models))))
        fk-refs  (into {}
                       (map (fn [[k model]]
                              [k (zipmap (map :entity_id rows)
                                         (serialization/column-refs serialization/app-db-store model (map k rows)))]))
                       fk-models)
        subjects (into {}
                       (map (fn [{eid :entity_id subject-name :name}]
                              [eid (into {:serdes/meta [{:model (name subject-model)}]
                                          :name        subject-name
                                          :entity_id   eid}
                                         (map (fn [[k refs]] [k (get refs eid)]))
                                         fk-refs)]))
                       rows)
        paths    (serialization/batch-storage-paths (mapv #(get subjects (subject-key %)) tests))]
    (mapv (fn [saved-test path]
            (conj path {:label (:name saved-test) :key (:entity_id saved-test)}))
          tests paths)))

(defn transform-test-storage-paths
  "The storage path of each of the TransformTest `entities`, in the directory of the file of its Transform."
  [entities _ctx]
  (subject-storage-paths entities :model/Transform :transform_id {:collection_id :model/Collection}))

(defn transform-test-import-dependencies
  "The Transform each of the TransformTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [transform_id]}]
          #{[:model/Transform transform_id]})
        entities))

(defn card-test-storage-paths
  "The storage path of each of the CardTest `entities`, in the directory of the file of its Card, which a collection,
  a dashboard or a document holds."
  [entities _ctx]
  (subject-storage-paths entities :model/Card :card_id {:collection_id :model/Collection
                                                        :dashboard_id  :model/Dashboard
                                                        :document_id   :model/Document}))

(defn card-test-import-dependencies
  "The Card each of the CardTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [card_id]}]
          #{[:model/Card card_id]})
        entities))

(defn segment-test-storage-paths
  "The storage path of each of the SegmentTest `entities`, in the directory of the file of its Segment, whose path only
  its exported definition names."
  [entities _ctx]
  (let [segments (vals (serialization/rows-by-refs :model/Segment (into #{} (keep :segment_id) entities) nil))
        exported (zipmap (map :entity_id segments) (serialization/export-batch :model/Segment segments))
        paths    (serialization/batch-storage-paths (mapv #(get exported (:segment_id %)) entities))]
    (mapv (fn [segment-test path]
            (conj path {:label (:name segment-test) :key (:entity_id segment-test)}))
          entities paths)))

(defn segment-test-import-dependencies
  "The Segment each of the SegmentTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [segment_id]}]
          #{[:model/Segment segment_id]})
        entities))
