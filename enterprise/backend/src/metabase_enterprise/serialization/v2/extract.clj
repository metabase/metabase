(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.serialization.v2.dependency-validation :as dependency-validation]
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
    (conj "Transform" "TransformTag" "TransformJob" "PythonLibrary")

    (not (:no-embedding-themes opts))
    (conj "EmbeddingTheme")

    (not (:no-custom-viz-plugins opts))
    (conj "CustomVizPlugin")))

;; OsiAiContext is intentionally NOT in the default export set. It's a top-level model that *depends on* its
;; entity, extracted unfiltered, so any export — even an untargeted "full" one, which still omits personal and
;; analytics collections — would pull ai_context rows whose referenced Card/Table/Measure/Segment is absent,
;; leaking curator text and creating dangling deps that fail import. It stays out until reverse-dependency
;; export lands (its row should travel *with* its entity), tracked in
;; https://linear.app/metabase/issue/BOT-1759; see the metabase.osi.models.osi-ai-context serdes TODO.

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

(defn- analytics-card-ids
  "Of `card-ids`, the subset living in an 'analytics' namespace collection. These are removed from extraction (they
   have stable entity_ids across instances) and references to them stay valid, resolving on import. `card-ids` is
   queried in bounded `:in` batches so a large closure doesn't blow past database parameter limits."
  [card-ids]
  (let [analytics-colls (analytics-collection-ids)]
    (if (and (seq card-ids) (seq analytics-colls))
      (into #{}
            (comp (partition-all serdes/query-batch-size)
                  (mapcat (fn [batch]
                            (t2/select-pks-set :model/Card {:where [:and
                                                                    [:in :id (vec batch)]
                                                                    [:in :collection_id (vec analytics-colls)]]}))))
            card-ids)
      #{})))

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
  (let [models       (model-set opts)
        has-content? (seq (set/intersection (set serdes.models/content) models))
        nodes        (when has-content?
                       (resolve-targets opts user-id))
        ;; `by-model` is a map of `{model-name [ids ...]}`
        by-model (u/group-by first second (keys nodes))
        ;; Cards in analytics collections aren't extracted (stable entity_ids), but references to them stay valid.
        analytics-cards (when has-content?
                          (analytics-card-ids (get by-model "Card")))
        coll-set        (get by-model "Collection")]
    ;; Validate that every entity to be extracted has all its references satisfied; aborts (unless
    ;; continue-on-error) before any archive is produced, so incomplete exports fail fast and loudly.
    (when has-content?
      (dependency-validation/validate-dependencies! by-model coll-set analytics-cards opts)) ;; may throw
    (let [;; When targets are specified, also include Tables found via descendants
          ;; (published tables in target collections). These are extracted by ID, not all.
          targeted-data-model (when (seq targets)
                                (select-keys by-model serdes.models/data-model-in-collection))
          by-model        (cond-> (select-keys by-model models)
                            ;; Add Tables back if they were found in descendants
                            (seq targeted-data-model) (merge targeted-data-model)
                            ;; Remove analytics cards from extraction - they have stable entity_ids across instances
                            ;; so cards that reference them can still be exported and imported correctly
                            (and analytics-cards (contains? by-model "Card"))
                            (update "Card" (fn [ids] (vec (remove analytics-cards ids)))))
          extract-by-ids  (fn [[model ids]]
                            (serdes/extract-all model (merge opts {:collection-set coll-set
                                                                   :where          [:in (serdes/primary-key model) ids]})))
          extract-all     (fn [model]
                            (serdes/extract-all model (assoc opts :collection-set coll-set)))]
      (eduction cat
                [(if (seq targets)
                   (eduction (map extract-by-ids) cat by-model)
                   (eduction (map extract-all) cat (set/intersection (set serdes.models/content) models)))
                 ;; extract all non-content entities like data model and settings if necessary
                 (eduction (map #(serdes/extract-all % opts)) cat (remove (set serdes.models/content) models))]))))

(defn extract
  "Returns a reducible stream of entities to serialize"
  [opts]
  (extract-subtrees opts))

(comment
  (def nodes (let [colls (mapv vector (repeat "Collection") (collection-set-for-user nil))]
               (merge
                (u/traverse colls #(serdes/ascendants (first %) (second %)))
                (u/traverse colls #(serdes/descendants (first %) (second %) {})))))
  (def by-model (u/group-by first second (keys nodes)))
  ;; continue-on-error so this just logs in the REPL instead of throwing
  (dependency-validation/validate-dependencies! by-model (get by-model "Collection")
                                                (analytics-card-ids (get by-model "Card"))
                                                {:continue-on-error true}))
