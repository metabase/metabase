(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- model-set
  "Returns a set of models to export based on export opts"
  [opts]
  (cond-> #{}
    (:include-field-values opts)
    (conj "FieldValues")

    (:include-metabot opts)
    (conj "Metabot")

    (not (:no-collections opts))
    (into serdes.models/content)

    (not (:no-data-model opts))
    (into serdes.models/data-model)

    (not (:no-settings opts))
    (conj "Setting")

    (not (:no-transforms opts))
    (conj "Transform" "TransformTag" "TransformJob")))

(defn make-targets-of-type
  "Returns a targets seq with model type and given ids"
  [model-name ids]
  (mapv vector (repeat model-name) ids))

(defn- collection-set-for-user
  "Returns a set of collection IDs to export for the provided user, if any.
   If user-id is nil, do not include any personally-owned collections.

  Does not export ee-only analytics collections."
  [user-id]
  (let [roots (t2/select :model/Collection {:where [:and [:= :location "/"]
                                                    [:or [:= :personal_owner_id nil]
                                                     [:= :personal_owner_id user-id]]
                                                    [:or [:= :namespace nil]
                                                     [:!= :namespace "analytics"]]]})]
    ;; start with the special "nil" root collection ID
    (-> #{nil}
        (into (map :id) roots)
        (into (mapcat collection/descendant-ids) roots))))

(defn- collection-label [coll-id]
  (if coll-id
    (let [collection (t2/hydrate (t2/select-one :model/Collection :id coll-id) :ancestors)
          names      (->> (conj (:ancestors collection) collection)
                          (map :name)
                          (str/join " > "))]
      (format "%d: %s" coll-id names))
    "[no collection]"))

(defn- entity-label [{:keys [model id]}]
  (let [entity (t2/select-one [model :collection_id :name] :id id)]
    (format "%s %d (%s from collection %s)" (name model) id (:name entity) (collection-label (:collection_id entity)))))

(defn- parse-target [[model-name id :as target]]
  (if (string? id)
    (if-let [resolved-id (serdes/eid->id model-name id)]
      [model-name resolved-id]
      (throw (ex-info (format "Could not find %s with entity ID: %s" model-name id)
                      {:status-code 400
                       :model       model-name
                       :entity-id   id})))
    target))

(defn- analytics-collection-ids
  "Returns a set of collection IDs that are in the 'analytics' namespace (internal analytics collections).
   These collections are intentionally excluded from serialization."
  []
  (let [analytics-roots (t2/select :model/Collection {:where [:= :namespace "analytics"]})]
    (into (set (map :id analytics-roots))
          (mapcat collection/descendant-ids)
          analytics-roots)))

(defn- escape-analysis
  "Analyzes the dependency graph to find cards that are outside the collection set (escapees).
   Returns a map with:
   - :reportable-escaped - escapees that should trigger warnings (non-analytics)
   - :analytics-card-ids - card IDs in analytics collections (should be removed from extraction but not block export)

   Cards that depend on analytics cards are allowed to be exported - the references will be converted
   to entity_ids during export and resolved on import since analytics cards have stable entity_ids."
  [{colls "Collection" cards "Card" :as _by-model} nodes]
  (log/tracef "Running escape analysis for %d colls and %d cards" (count colls) (count cards))
  (when-let [colls (-> colls set not-empty)]
    (let [clause           {:where [:or
                                    [:in :collection_id colls]
                                    (when (contains? colls nil)
                                      [:= :collection_id nil])]}
          possible-pks     (t2/select-pks-set :model/Card clause)
          escaped-card-ids (set/difference (set cards) possible-pks)]
      (when (seq escaped-card-ids)
        ;; Analytics cards have stable entity_ids across instances, so cards that depend on them
        ;; can still be exported: the references will be resolved on import
        (let [analytics-colls      (analytics-collection-ids)
              escaped-in-analytics (if (seq analytics-colls)
                                     (t2/select-pks-set :model/Card {:where [:and
                                                                             [:in :id escaped-card-ids]
                                                                             [:in :collection_id analytics-colls]]})
                                     #{})
              reportable-escaped   (set/difference escaped-card-ids escaped-in-analytics)]
          {:reportable-escaped (->> reportable-escaped
                                    (mapv (fn [id]
                                            (-> (get nodes ["Card" id])
                                                (assoc :escapee {:model :model/Card
                                                                 :id    id})))))
           :analytics-card-ids escaped-in-analytics})))))

(defn- log-escape-report! [escaped]
  (let [dashboards (group-by #(get % "Dashboard") escaped)]
    (doseq [[dash-id escapes] (dissoc dashboards nil)]
      (log/warnf "Failed to export Dashboard %d (%s) containing Card saved outside requested collections: %s"
                 dash-id
                 (t2/select-one-fn :name :model/Dashboard :id dash-id)
                 (str/join ", " (map #(entity-label (:escapee %)) escapes))))
    (when-let [other (not-empty (get dashboards nil))]
      (log/warnf "Failed to export Cards based on questions outside requested collections: %s"
                 (str/join ", " (for [item other]
                                  (format "%s -> %s"
                                          (if (get item "Card")
                                            (entity-label {:model :model/Card :id (get item "Card")})
                                            (dissoc item :escapee))
                                          (entity-label (:escapee item)))))))))

(defn- resolve-targets
  "Returns all targets (for either supplied initial `targets` or for supplied `user-id`)."
  [{:keys [targets] :as opts} user-id]
  (let [initial-targets (if (seq targets)
                          (mapv parse-target targets)
                          (mapv vector (repeat "Collection") (collection-set-for-user user-id)))
        ;; a map of `{[model-name id] {source-model source-id ...}}`
        targets         (u/traverse initial-targets #(serdes/descendants (first %) (second %) opts))]
    ;; due to traverse argument we'd lose original source entities, lets track them
    (merge-with into
                targets
                (u/traverse (map key targets) #(serdes/required (first %) (second %))))))

(defn- extract-subtrees
  "Extracts the targeted entities and all their descendants into a reducible stream of extracted maps.

  The targeted entities are specified as a list of `[\"SomeModel\" pk-or-entity-id]` pairs.

  [[serdes/descendants]] is recursively called on these entities and all their descendants, until the
  complete transitive closure of all descendants is found. This produces a set of `[\"ModelName\" id]` pairs, which
  entities are then returned as a reducible stream of serializable entity maps, with `:serdes/meta` keys.

  Eg. if Dashboard B includes a Card A that is derived from a Card C that's in an alien collection, warnings will be
  emitted for C, A and B, and all three will be excluded from the serialized output.

  `opts` are passed down to [[serdes/extract-all]] for each model."
  [{:keys [targets user-id] :as opts}]
  (log/tracef "Extracting subtrees with options: %s" (pr-str opts))
  (let [nodes    (resolve-targets opts user-id)
        ;; by model is a map of `{model-name [ids ...]}`
        by-model (u/group-by first second (keys nodes))
        {:keys [reportable-escaped analytics-card-ids]} (escape-analysis by-model nodes)]
    (if (seq reportable-escaped)
      (log-escape-report! reportable-escaped)
      (let [models          (model-set opts)
            coll-set        (get by-model "Collection")
            by-model        (cond-> (select-keys by-model models)
                              ;; Remove analytics cards from extraction - they have stable entity_ids across instances
                              ;; so cards that reference them can still be exported and imported correctly
                              (and analytics-card-ids (contains? by-model "Card"))
                              (update "Card" (fn [ids] (vec (remove analytics-card-ids ids)))))
            extract-by-ids  (fn [[model ids]]
                              (serdes/extract-all model (merge opts {:collection-set coll-set
                                                                     :where          [:in :id ids]})))
            extract-all     (fn [model]
                              (serdes/extract-all model (assoc opts :collection-set coll-set)))]
        (eduction cat
                  [(if (seq targets)
                     (eduction (map extract-by-ids) cat by-model)
                     (eduction (map extract-all) cat (set/intersection (set serdes.models/content) models)))
                   ;; extract all non-content entities like data model and settings if necessary
                   (eduction (map #(serdes/extract-all % opts)) cat (remove (set serdes.models/content) models))])))))

(defn extract
  "Returns a reducible stream of entities to serialize"
  [opts]
  (serdes.backfill/backfill-ids!)
  (extract-subtrees opts))

(comment
  (def nodes (let [colls (mapv vector (repeat "Collection") (collection-set-for-user nil))]
               (merge
                (u/traverse colls #(serdes/ascendants (first %) (second %)))
                (u/traverse colls #(serdes/descendants (first %) (second %) {})))))
  (def escaped (escape-analysis (u/group-by first second (keys nodes)) nodes))
  (log-escape-report! escaped))
