(ns metabase-enterprise.serialization.v2.extract
  "Extraction, the first step of an export: the entities an export takes, which storage then writes.

  An export selects rows with SQL alone: the Collections it targets with their descendants, their content, and the
  other models it takes (see [[select/select-rows]]); [[metabase.serialization.core/export]] converts them, and
  [[dependency-validation/validate-dependencies!]] checks that what they depend on is exported or exists."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase-enterprise.serialization.v2.dependency-validation :as dependency-validation]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase-enterprise.serialization.v2.select :as select]
   [metabase.collections.models.collection :as collection]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- model-set
  "The models an export of `opts` takes."
  [opts]
  (cond-> #{}
    (:include-field-values opts)       (conj :model/FieldValues)
    (:include-metabot opts)            (conj :model/Metabot)
    (not (:no-collections opts))       (into serdes.models/content)
    (not (:no-data-model opts))        (into serdes.models/data-model)
    (not (:no-settings opts))          (conj :model/Setting)
    (not (:no-transforms opts))        (conj :model/Transform :model/TransformTag :model/TransformJob :model/TransformTest
                                             :model/PythonLibrary)
    (not (:no-embedding-themes opts))  (conj :model/EmbeddingTheme)
    (not (:no-custom-viz-plugins opts)) (conj :model/CustomVizPlugin)
    (not (:no-data-apps opts))         (conj :model/DataApp)))

(defn make-targets-of-type
  "The targets of an export of the `model` entities with `ids`, `model` a model keyword or name."
  [model ids]
  (mapv vector (repeat (keyword "model" (name model))) ids))

(defn- collection-set-for-user
  "The ids of the Collections an untargeted export takes for the User with `user-id`: every non-personal one, and the
  personal ones of that User, without the analytics Collections. Nil stands for the root collection."
  [user-id]
  (let [roots (serialization.db/root-collections-for-user user-id)]
    (-> #{nil}
        (into (map :id) roots)
        (into (mapcat collection/descendant-ids) roots))))

(defn- missing-target-error
  "Bad-input error for a target that matches no row. `id-kind` names the flavour of id for the message."
  [model id-kind id]
  (ex-info (format "Could not find %s with %s: %s" (name model) id-kind id)
           {:status-code 400
            :model       (name model)
            :id          id}))

(defn- parse-target
  "The `[model id]` of a target, `model` a model keyword or name and `id` its primary key or entity id, checking that it
  exists."
  [[model id]]
  (let [model (keyword "model" (name model))]
    (if (string? id)
      (if-let [pk (serialization.db/entity-pk model id)]
        [model pk]
        (throw (missing-target-error model "entity ID" id)))
      (do (when-not (serialization.db/instance-exists? model id)
            (throw (missing-target-error model "ID" id)))
          [model id]))))

(defn- analytics-collection-ids
  "The ids of the analytics Collections, which an export leaves out."
  []
  (let [roots (serialization.db/analytics-root-collections)]
    (into (set (map :id roots)) (mapcat collection/descendant-ids) roots)))

(defn- analytics-card-ids
  "Of `card-ids`, the ones in an analytics Collection, which an export leaves out: they have the same entity ids on
  every instance, so references to them resolve on import."
  [card-ids]
  (let [colls (analytics-collection-ids)]
    (if (and (seq card-ids) (seq colls))
      (into #{}
            (comp (partition-all serialization/batch-size)
                  (mapcat #(serialization.db/card-ids-in-collections (vec %) (vec colls))))
            card-ids)
      #{})))

(defn- selection
  "The `{:collection-set ids :ids {model ids}}` an export of `opts` selects: the Collections of its `:targets`, and
  those of the DataApps it targets, with their descendants, or those of `:user-id` when it has no targets, unarchived
  ones only with `:skip-archived`, and the rows of other models it targets."
  [{:keys [targets user-id skip-archived]}]
  (if (seq targets)
    (let [by-model (u/group-by first second (map parse-target targets))
          roots    (into (vec (remove nil? (get by-model :model/Collection)))
                         (serialization.db/data-app-collection-ids (vec (get by-model :model/DataApp))))]
      {:collection-set (cond-> (serialization.db/collection-subtree-ids roots (boolean skip-archived))
                         (some nil? (get by-model :model/Collection)) (conj nil))
       :ids            (dissoc by-model :model/Collection)})
    {:collection-set (let [ids (collection-set-for-user user-id)]
                       (cond-> ids
                         skip-archived (-> (set/difference (serialization.db/archived-collection-ids
                                                            (vec (remove nil? ids))))
                                           set)))
     :ids            {}}))

(defn- content-ids
  "The map from each content model of `models` to the primary keys of the rows of it an export of `opts` with
  `selection` takes: those in its Collections, and those it targets."
  [models {:keys [collection-set ids]} opts]
  (into {}
        (keep (fn [model]
                (let [selected (cond-> (set (get ids model))
                                 (seq collection-set) (into (select/select-ids model (assoc opts :collection-set collection-set))))]
                  (when (seq selected)
                    [model selected]))))
        (set/intersection models (set serdes.models/content))))

(defn- select-rows-by-ids
  "The rows of `model` with the primary keys `ids` that `opts` select, a batch at a time."
  [model ids opts]
  (into [] (comp (partition-all serialization/batch-size)
                 (mapcat #(select/select-rows model (assoc opts :ids (vec %)))))
        ids))

(defn- with-dependencies
  "`by-model`, a map from content models to primary keys, with the rows of the content `models` its rows depend on,
  transitively, found by escape analysis, but elidable ones, as an export of the Collections `collection-set` takes
  them: Snippets and their folders, and with no Collections those outside analytics Collections, or else those in the
  Collections or their ancestors, whose rows it takes too."
  [by-model models collection-set opts]
  (let [content   (set/difference (set/intersection models (set serdes.models/content))
                                  serdes.models/elidable-content-models)
        analytics (analytics-collection-ids)
        ancestors (into #{}
                        (mapcat (comp collection/location-path->ids :location))
                        (select-rows-by-ids :model/Collection (remove nil? collection-set) opts))
        allowed   (into (set collection-set) ancestors)
        taken?    (fn [model row]
                    (cond
                      (= :model/NativeQuerySnippet model)                    true
                      (and (= :model/Collection model)
                           (= "snippets" (some-> (:namespace row) name)))    true
                      (seq collection-set)                                   (contains? allowed (if (= :model/Collection model)
                                                                                                  (:id row)
                                                                                                  (:collection_id row)))
                      (= :model/Collection model)                            (not (contains? analytics (:id row)))
                      :else                                                  (not (contains? analytics (:collection_id row)))))]
    (loop [by-model by-model
           frontier (into {} (map (fn [[model ids]] [model (select-rows-by-ids model ids opts)])) by-model)]
      (let [candidates (reduce (fn [m [model id]]
                                 (cond-> m
                                   (and (content model) (some? id) (not (contains? (get by-model model) id)))
                                   (update model (fnil conj #{}) id)))
                               {}
                               (keys (serialization/export-escapes frontier)))
            fetched    (into {} (map (fn [[model ids]] [model (select-rows-by-ids model ids opts)])) candidates)
            added      (into {}
                             (keep (fn [[model rows]]
                                     (when-let [rows (seq (filter #(taken? model %) rows))]
                                       [model (vec rows)])))
                             fetched)]
        (if (seq added)
          (recur (merge-with into by-model (update-vals added #(set (map :id %)))) added)
          by-model)))))

(defn- export-rows
  "The rows of `model` that `opts` select, exported."
  [model opts]
  (serialization/export model (select/select-rows model opts) :continue-on-error (:continue-on-error opts)))

(defn export-ids
  "The rows of `model` with the primary keys `ids` that `opts` select, exported a batch at a time."
  [model ids opts]
  (eduction (mapcat #(export-rows model (assoc opts :ids (vec %)))) (partition-all serialization/batch-size ids)))

(defn- export-card-tests
  "The CardTests of the Cards with `card-ids` that `opts` select, exported a batch of Cards at a time."
  [card-ids opts]
  ;; `card-ids` holds targeted Cards before the export's filters, which can leave a Card out; its tests stay out too.
  (eduction (comp (map #(select/select-ids :model/Card (assoc opts :ids (vec %))))
                  (filter seq)
                  (mapcat #(export-rows :model/CardTest (assoc opts :card-ids (vec %)))))
            (partition-all serialization/batch-size card-ids)))

(defn extract
  "A reducible of the exported entities an export of `opts` takes: the content of the Collections it selects (see
  [[selection]]) with the content it depends on, the published Tables of those Collections with their data model
  when it has `:targets`, the CardTests of its Cards, and every row of the other models it takes. Reduce it within
  [[metabase.serialization.core/with-export-transaction]] for a consistent snapshot."
  [{:keys [targets] :as opts}]
  (log/tracef "Extracting with options: %s" (pr-str opts))
  (let [models     (model-set opts)
        selected   (selection opts)
        by-model   (with-dependencies (content-ids models selected opts) models (:collection-set selected) opts)
        analytics  (analytics-card-ids (vec (get by-model :model/Card)))
        by-model   (cond-> by-model
                     (seq analytics) (update :model/Card #(set (remove analytics %))))
        table-ids  (when (and (seq targets) (seq (:collection-set selected)))
                     (select/select-ids :model/Table (assoc opts :collection-set (:collection-set selected))))
        table-dm   (when (seq table-ids)
                     (remove models serdes.models/data-model-in-collection))]
    (when (seq by-model)
      (dependency-validation/validate-dependencies! by-model analytics-card-ids opts))
    (eduction cat
              [(eduction (mapcat (fn [[model ids]] (export-ids model ids opts))) by-model)
               (eduction (mapcat #(export-rows % (assoc opts :table-ids table-ids))) table-dm)
               (export-card-tests (get by-model :model/Card) opts)
               (eduction (mapcat #(export-rows % opts)) (set/difference models (set serdes.models/content)))])))
