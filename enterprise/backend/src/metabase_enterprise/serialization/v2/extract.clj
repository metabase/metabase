(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models.collection :as collection]
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

    (not (:no-collections opts))
    (into serdes.models/content)

    (not (:no-data-model opts))
    (into serdes.models/data-model)

    (not (:no-settings opts))
    (conj "Setting")))

(defn targets-of-type
  "Returns target seq filtered on given model name"
  [targets model-name]
  (filter #(= (first %) model-name) targets))

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

(defn- card-label [card-id]
  (let [card (t2/select-one [:model/Card :collection_id :name] :id card-id)]
    (format "Card %d (%s from collection %s)" card-id (:name card) (collection-label (:collection_id card)))))

(defn- parse-target [[model-name id :as target]]
  (if (string? id)
    [model-name (serdes/eid->id model-name id)]
    target))

(defn- escape-analysis [{colls "Collection" cards "Card"} nodes]
  (log/tracef "Running escape analysis for %d colls and %d cards" (count colls) (count cards))
  (when-let [colls (-> colls set not-empty)]
    (let [known-cards (t2/select-pks-set :model/Card {:where [:or
                                                              [:in :collection_id colls]
                                                              (when (contains? colls nil)
                                                                [:= :collection_id nil])]})
          escaped     (->> (set/difference (set cards) known-cards)
                           (mapv (fn [id]
                                   (-> (get nodes ["Card" id])
                                       (assoc :escapee id)))))]
      escaped)))

(defn- log-escape-report! [escaped]
  (let [dashboards (group-by #(get % "Dashboard") escaped)]
    (doseq [[dash-id escapes] (dissoc dashboards nil)]
      (log/warnf "Failed to export Dashboard %d (%s) containing Card saved outside requested collections: %s"
                 dash-id
                 (t2/select-one-fn :name :model/Dashboard :id dash-id)
                 (str/join ", " (map #(card-label (:escapee %)) escapes))))
    (when-let [other (not-empty (get dashboards nil))]
      (log/warnf "Failed to export Cards based on questions outside requested collections: %s"
                 (str/join ", " (for [item other]
                                  (format "%s -> %s"
                                          (if (get item "Card")
                                            (card-label (get item "Card"))
                                            (dissoc item :escapee))
                                          (card-label (:escapee item)))))))))

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
  (let [inner-targets (if (seq targets)
                        (mapv parse-target targets)
                        (mapv vector (repeat "Collection") (collection-set-for-user user-id)))
        ;; nodes are a map of `{[model-name id] {dep-model dep-id ...}}`
        nodes         (set/union
                       (u/traverse inner-targets #(serdes/ascendants (first %) (second %)))
                       (u/traverse inner-targets #(serdes/descendants (first %) (second %))))
        ;; by model is a map of `{model-name [ids ...]}`
        by-model      (u/group-by first second (keys nodes))
        escaped       (escape-analysis by-model nodes)]
    (if (seq escaped)
      (log-escape-report! escaped)
      (let [models         (model-set opts)
            coll-set       (get by-model "Collection")
            by-model       (select-keys by-model models)
            extract-by-ids (fn [[model ids]]
                             (serdes/extract-all model (merge opts {:collection-set coll-set
                                                                    :where          [:in :id ids]})))
            extract-all    (fn [model]
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
                (u/traverse colls #(serdes/descendants (first %) (second %))))))
  (def escaped (escape-analysis (u/group-by first second (keys nodes)) nodes))
  (log-escape-report! escaped))
