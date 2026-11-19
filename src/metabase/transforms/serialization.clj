(ns metabase.transforms.serialization
  "The SerDes of Transforms, TransformJobs and TransformTags."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn export-strings
  "A transform fn exporting the values as strings."
  [_store _rows values _opts]
  (mapv str values))

(def string-transform
  "The transform of a column exported as a string and imported as it is."
  {:export export-strings :import serialization/import-unchanged})

(defn- drop-merge-key-field-ids
  "`target` without the `:field-id`s of its merge unique key. The merge reads only the column names, and
  [[metabase.transforms.models.transform/resolve-merge-key-field-ids]] fills the ids from the target table once it
  syncs, so a reference would only make the import stub out a table the transform has yet to create."
  [target]
  (m/update-existing-in target [:target-incremental-strategy :unique-key]
                        (fn [unique-key] (mapv #(dissoc % :field-id) unique-key))))

(defn- walk-export-source
  "The exported `source` of a transform, its ids replaced by the references `visit` resolves them to. A checkpoint
  field that no longer exists is dropped, since a local id names nothing on another instance."
  [visit source]
  (let [database #(serialization/visit-some :model/Database % visit)]
    (-> source
        (m/update-existing :query #(serialization/walk-export visit %))
        (m/update-existing :source-database database)
        (m/update-existing :source-tables
                           (fn [entries]
                             (mapv #(-> %
                                        (m/update-existing :table_id
                                                           (fn [id] (serialization/visit-some :model/Table id visit)))
                                        (m/update-existing :database_id database))
                                   (transforms-base.u/normalize-source-tables entries))))
        (m/update-existing :source-incremental-strategy
                           (fn [{field-id :checkpoint-filter-field-id :as strategy}]
                             (if-let [field-ref (when field-id
                                                  (serialization/found-or-nil #(visit :model/Field field-id)))]
                               (assoc strategy :checkpoint-filter-field-id field-ref)
                               (dissoc strategy :checkpoint-filter-field-id)))))))

(defn- walk-import-source
  "The `source` of an exported transform with its references replaced by the ids `visit` resolves them to, keeping the
  raw numeric ids of older exports."
  [visit source]
  (let [ref-or-id (fn [model] (fn [v] (if (or (nil? v) (pos-int? v)) v (visit model v))))
        entry     #(-> %
                       (m/update-existing :table_id (ref-or-id :model/Table))
                       (m/update-existing :database_id (ref-or-id :model/Database)))]
    (cond->> (-> source
                 (m/update-existing :query #(serialization/walk-import visit %))
                 (m/update-existing :source-database (ref-or-id :model/Database))
                 (m/update-existing :source-tables
                                    (fn [entries]
                                      (if (map? entries)
                                        (update-vals entries #(if (map? %) (entry %) ((ref-or-id :model/Table) %)))
                                        (mapv entry entries))))
                 (m/update-existing-in [:source-incremental-strategy :checkpoint-filter-field-id]
                                       (ref-or-id :model/Field)))
      (not (serialization/collecting? visit)) (lib/normalize ::transforms.schema/transform-source))))

(defn- export-sources
  "Exports the `source` values `sources` of Transforms with references in place of ids."
  [store _transforms sources _opts]
  (serialization/export-in-bulk store sources walk-export-source))

(defn- import-sources
  "Imports the exported `source` values `sources` of Transforms with ids in place of references, leaving out the
  sources an older export left unresolved."
  [store _entities sources opts]
  (serialization/import-in-bulk
   store
   sources
   opts
   (fn [visit source]
     (cond->> source
       (not (:serdes/unresolved source)) (walk-import-source visit)))))

(def source-transform
  "The transform of the `source` of Transforms."
  {:export export-sources
   :import import-sources})

(defn- export-targets
  "Exports the `target` values `targets` of Transforms without their table ids and merge key field ids."
  [store _transforms targets _opts]
  (serialization/export-mbql store (map #(drop-merge-key-field-ids (dissoc % :table_id)) targets)))

(defn- import-targets
  "Imports the exported `target` values `targets` of Transforms without their merge key field ids."
  [store _entities targets opts]
  (serialization/import-mbql store (map drop-merge-key-field-ids targets) opts))

(def target-transform
  "The transform of the `target` of Transforms."
  {:export export-targets
   :import import-targets})

(defn transform-storage-paths
  "The storage path of each of the Transform `entities`, in the `transforms` folder by its collection."
  [entities ctx]
  (mapv (fn [transform]
          (serialization/storage-default-collection-path transform ctx "transforms"))
        entities))

(defn transform-import-dependencies
  "The `[model ref]` of the Collection, tags and source references of each of the Transform `entities`."
  [entities]
  (mapv (fn [{:keys [collection_id source tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (for [{tag-id :tag_id} tags] [:model/TransformTag tag-id])
                       (when-not (:serdes/unresolved source)
                         (serialization/import-mbql-dependencies source)))))
        entities))

(defn transform-loaded-entities
  "The Transform `entities` an import loads, all but those an older export left without their source database."
  [entities]
  (let [{unresolved true resolved false} (group-by #(boolean (get-in % [:source :serdes/unresolved])) entities)]
    (doseq [{:keys [entity_id]} unresolved]
      (log/warnf "Skipping transform %s, since an export from before 66 left it without its deleted source database"
                 entity_id))
    (vec resolved)))

(defn transform-job-before-load
  "The TransformJob load `items`, a built-in job keeping its local name and description."
  [items]
  (mapv (fn [{:keys [local row] :as item}]
          (cond-> item
            (and (some? (:built_in_type local)) (= (:built_in_type local) (:built_in_type row)))
            (update :row assoc :name (:name local) :description (:description local))))
        items))

(defn transform-job-storage-paths
  "The storage path of each of the TransformJob `entities`, under `transforms/transform_jobs/` by name."
  [entities _ctx]
  (mapv (fn [job]
          [{:label "transforms"} {:label "transform_jobs"} {:label (:name job) :key (:entity_id job)}])
        entities))

(defn transform-job-import-dependencies
  "The TransformTags each of the TransformJob `entities` depends on."
  [entities]
  (mapv (fn [{:keys [job_tags]}]
          (set (for [{tag-id :tag_id} job_tags]
                 [:model/TransformTag tag-id])))
        entities))

(defn- built-in-name-kept
  "`item`, a load item, with the name of the built-in tag it updates."
  [{:keys [local row] :as item}]
  (cond-> item
    (and (some? (:built_in_type local)) (= (:built_in_type local) (:built_in_type row)))
    (update :row assoc :name (:name local))))

(defn- free-name-taken
  "`item`, a load item, with the first of its name, then the name followed by \" (2)\", \" (3)\" and so on, that no other
  tag has, `taken` being the names the items before it took, each with its entity id."
  [taken {{:keys [entity_id] tag-name :name} :row, :keys [local] :as item}]
  (let [own?  (fn [owner] (or (nil? owner) (= owner entity_id) (= owner (:entity_id local))))
        free? (fn [candidate] (own? (or (get taken candidate) (transforms.db/tag-entity-id-by-name candidate))))
        n     (first (filter free? (cons tag-name (map #(str tag-name " (" % ")") (iterate inc 2)))))]
    [(assoc-in item [:row :name] n) (assoc taken n entity_id)]))

(defn transform-tag-before-load
  "The TransformTag load `items`, a built-in tag keeping its local name and the others renamed until no other tag holds
  their name."
  [items]
  (first
   (reduce (fn [[items taken] item]
             (if (not (string? (not-empty (get-in item [:row :name]))))
               [(conj items item) taken]
               (let [[item taken] (free-name-taken taken item)]
                 [(conj items item) taken])))
           [[] {}]
           (map built-in-name-kept items))))

(defn transform-tag-storage-paths
  "The storage path of each of the TransformTag `entities`, under `transforms/transform_tags/` by name."
  [entities _ctx]
  (mapv (fn [tt]
          [{:label "transforms"} {:label "transform_tags"} {:label (:name tt) :key (:entity_id tt)}])
        entities))
