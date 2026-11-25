(ns metabase-enterprise.data-testing.serialization
  "The SerDes of test suites and of saved tests. A saved test is stored in the directory of the file of the subject it
  tests."
  (:require
   [metabase.lib.core :as lib]
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn- subject-storage-paths
  "The storage path of each of `tests`, saved tests whose `subject-key` holds the entity id of a row of
  `subject-model`: the path of the subject's file, as a directory, then the test's name. The subject's path is computed
  from a stub of the subject, read with `columns` besides its entity id and name. `fk-models` maps each key the path
  reads to the model whose row the key names and a fn of the subject's row returning that row's id. `with-refs`
  returns the stub, given the stub's name and entity id and a map from each key of `fk-models` to the reference of its
  row."
  [tests subject-model subject-key columns fk-models with-refs]
  (let [rows     (vals (serialization/rows-by-refs subject-model
                                                   (into #{} (keep subject-key) tests)
                                                   (into [:entity_id :name] columns)))
        fk-refs  (into {}
                       (map (fn [[k [model row-id]]]
                              [k (zipmap (map :entity_id rows)
                                         (serialization/column-refs serialization/app-db-store
                                                                    model
                                                                    (map row-id rows)))]))
                       fk-models)
        subjects (into {}
                       (map (fn [{eid :entity_id subject-name :name}]
                              [eid (with-refs {:serdes/meta [{:model (name subject-model)}]
                                               :name        subject-name
                                               :entity_id   eid}
                                     (into {} (map (fn [[k refs]] [k (get refs eid)])) fk-refs))]))
                       rows)
        paths    (serialization/batch-storage-paths (mapv #(get subjects (subject-key %)) tests))]
    (mapv (fn [saved-test path]
            (conj path {:label (:name saved-test) :key (:entity_id saved-test)}))
          tests paths)))

(defn transform-test-storage-paths
  "The storage path of each of the TransformTest `entities`, in the directory of the file of its Transform."
  [entities _ctx]
  (subject-storage-paths entities :model/Transform :transform_id
                         [:collection_id]
                         {:collection_id [:model/Collection :collection_id]}
                         merge))

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
  (subject-storage-paths entities :model/Card :card_id
                         [:collection_id :dashboard_id :document_id]
                         {:collection_id [:model/Collection :collection_id]
                          :dashboard_id  [:model/Dashboard :dashboard_id]
                          :document_id   [:model/Document :document_id]}
                         merge))

(defn card-test-import-dependencies
  "The Card each of the CardTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [card_id]}]
          #{[:model/Card card_id]})
        entities))

(defn action-test-storage-paths
  "The storage path of each of the ActionTest `entities`, in the directory of the file of its Action, which a collection
  holds, and a model when the action is one of the model's."
  [entities _ctx]
  (subject-storage-paths entities :model/Action :action_id
                         [:collection_id :model_id]
                         {:collection_id [:model/Collection :collection_id]
                          :model_id      [:model/Card :model_id]}
                         merge))

(defn action-test-import-dependencies
  "The Action each of the ActionTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [action_id]}]
          #{[:model/Action action_id]})
        entities))

(defn segment-test-storage-paths
  "The storage path of each of the SegmentTest `entities`, in the directory of the file of its Segment."
  [entities _ctx]
  ;; The table that a segment's definition reads places the segment's file. The stub's definition names only that
  ;; table, so the path does not depend on exporting the segment's own definition, which can fail.
  (subject-storage-paths entities :model/Segment :segment_id
                         [:definition :table_id]
                         {:table [:model/Table (fn [{:keys [definition] table-id :table_id}]
                                                 ;; `table_id` follows the definition, except in a row written
                                                 ;; around the Segment model.
                                                 (or (some-> (not-empty definition) lib/primary-source-table-id)
                                                     table-id))]}
                         (fn [stub {:keys [table]}]
                           (assoc stub :definition {:lib/type :mbql/query
                                                    :stages   [{:lib/type     :mbql.stage/mbql
                                                                :source-table table}]}))))

(defn segment-test-import-dependencies
  "The Segment each of the SegmentTest `entities` tests."
  [entities]
  (mapv (fn [{:keys [segment_id]}]
          #{[:model/Segment segment_id]})
        entities))

(defn test-suite-storage-paths
  "The storage path of each of the TestSuite `entities`: a file named after the suite, in `test_suites`."
  [entities _ctx]
  (mapv (fn [suite]
          [{:label "test_suites"} {:label (:name suite) :key (:entity_id suite)}])
        entities))
