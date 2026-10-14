(ns metabase-enterprise.remote-sync.tracking
  "Starts and stops the remote-sync tracking of the content a switch syncs as a whole: the Library's snippets, data
  actions, and glossary, and the transforms."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.collections.core :as collections]))

(defn- create-rows
  "A 'create' ledger row of `model-type` for each of `instances`, named by `name-key`."
  [model-type instances name-key timestamp]
  (for [instance instances]
    (cond-> {:model_type        model-type
             :model_id          (:id instance)
             :model_name        (get instance name-key)
             :status            "create"
             :status_changed_at timestamp}
      (contains? instance :collection_id) (assoc :model_collection_id (:collection_id instance)))))

(defn- glossary-tracking-rows
  "A 'create' ledger row for each of the glossary `entries`."
  [entries timestamp]
  (create-rows "Glossary" entries :term timestamp))

(defn- data-action-collections
  "The `:id` and `:name` of the data actions Collections."
  []
  (remote-sync.db/collections-with-names-in-namespace (name collections/data-actions-ns)))

(defn- library-actions
  "The Actions without a model in the data actions root or a data actions Collection."
  [data-action-collection-ids]
  (remote-sync.db/actions-without-model-in (vec data-action-collection-ids)))

(defn enable-library-tracking!
  "Mark all existing snippets, data actions, their namespaces' collections, and glossary entries as 'create' for
  initial sync."
  []
  (let [timestamp               (t/offset-date-time)
        data-action-collections (data-action-collections)
        rows                    (concat
                                 (create-rows "Collection"
                                              (concat (remote-sync.db/snippet-collections) data-action-collections)
                                              :name timestamp)
                                 (create-rows "NativeQuerySnippet" (remote-sync.db/snippets) :name timestamp)
                                 (create-rows "Action" (library-actions (map :id data-action-collections)) :name timestamp)
                                 (glossary-tracking-rows (remote-sync.db/glossary-entries) timestamp))]
    (when (seq rows)
      (remote-sync.db/insert-rsos! rows))))

(defn backfill-glossary-tracking!
  "Insert a 'create' ledger row for every glossary entry that has none, so an instance upgraded with the Library
  already synced still pushes its entries. Returns the number of rows inserted."
  []
  (let [rows (vec (glossary-tracking-rows (remote-sync.db/untracked-glossary-entries) (t/offset-date-time)))]
    (when (seq rows)
      (remote-sync.db/insert-rsos! rows))
    (count rows)))

(defn disable-library-tracking!
  "Remove all snippet, data action, their namespaces' collection, and glossary tracking entries."
  []
  (let [data-action-coll-ids (into #{} (map :id) (data-action-collections))
        coll-ids             (into (remote-sync.db/snippet-collection-ids) data-action-coll-ids)
        action-ids           (into #{} (map :id) (library-actions data-action-coll-ids))]
    (remote-sync.db/delete-rsos-of-type! "NativeQuerySnippet")
    (remote-sync.db/delete-rsos-of-type! "Glossary")
    (when (seq coll-ids)
      (remote-sync.db/delete-rsos-of-models! "Collection" coll-ids))
    (when (seq action-ids)
      (remote-sync.db/delete-rsos-of-models! "Action" action-ids))))

(def ^:private transform-model-types
  "The model types synced with transforms, other than their collections."
  ["Transform" "TransformTag" "TransformTest" "PythonLibrary"])

(defn- transforms-collections
  "The `:id` and `:name` of the transforms Collections."
  []
  (remote-sync.db/collections-with-names-in-namespace (name collections/transforms-ns)))

(defn enable-transform-tracking!
  "Mark every untracked transform, transform tag, transform test, Python library, and transforms collection as 'create'
  for initial sync, leaving the built-in tags and Python library untracked."
  []
  (let [timestamp (t/offset-date-time)
        untracked (fn [model-type instances]
                    (let [tracked (remote-sync.db/tracked-model-ids model-type)]
                      (remove #(contains? tracked (:id %)) instances)))
        rows      (concat
                   (create-rows "Collection" (untracked "Collection" (transforms-collections)) :name timestamp)
                   (create-rows "Transform" (untracked "Transform" (remote-sync.db/transforms)) :name timestamp)
                   (create-rows "TransformTag" (untracked "TransformTag" (remote-sync.db/custom-transform-tags))
                                :name timestamp)
                   (create-rows "TransformTest" (untracked "TransformTest" (remote-sync.db/transform-tests))
                                :name timestamp)
                   (create-rows "PythonLibrary" (untracked "PythonLibrary" (remote-sync.db/custom-python-libraries))
                                :path timestamp))]
    (when (seq rows)
      (remote-sync.db/insert-rsos! rows))))

(defn disable-transform-tracking!
  "Remove the tracking entries of every transform, transform tag, transform test, Python library, and transforms
  collection."
  []
  (run! remote-sync.db/delete-rsos-of-type! transform-model-types)
  (when-let [coll-ids (not-empty (into #{} (map :id) (transforms-collections)))]
    (remote-sync.db/delete-rsos-of-models! "Collection" coll-ids)))
