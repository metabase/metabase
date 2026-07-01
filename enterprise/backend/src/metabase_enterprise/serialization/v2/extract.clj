(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
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
    (conj "CustomVizPlugin")

    (not (:no-curated-search opts))
    (conj "CuratedSearchEntry")))

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

(defn- analytics-card-ids
  "Of `card-ids`, the subset living in an 'analytics' namespace collection. These are removed from extraction (they
   have stable entity_ids across instances) and references to them stay valid, resolving on import."
  [card-ids]
  (let [analytics-colls (analytics-collection-ids)]
    (if (and (seq card-ids) (seq analytics-colls))
      (t2/select-pks-set :model/Card {:where [:and
                                              [:in :id (vec card-ids)]
                                              [:in :collection_id (vec analytics-colls)]]})
      #{})))

(def ^:private query-batch-size
  "Maximum number of ids per `:in` clause, to stay under database parameter limits."
  1000)

(defn- resize-batch
  [[model batch]]
  (for [batch (partition-all query-batch-size batch)]
    [model batch]))

(defn- entity-deps
  "The dependency contribution of a single entity, as a `{:visited :deps}` value: the entity's own `[model id]` as
   visited, plus every reference it makes (via [[serdes/serialization-dependencies]]), tagged with the `:via` entity
   that made it. The model name is read off the entity, which [[serdes/extract-query]] returns as a modeled row."
  [entity]
  (let [model (name (t2/model entity))
        via   [model (:id entity)]]
    {:visited #{via}
     :deps    (mapv #(assoc % :via via)
                    (serdes/serialization-dependencies model entity))}))

(defn- merge-deps
  "Monoid over `{:visited :deps}` accumulators: identity (0-arity), completion (1-arity), and associative combine
   (2-arity), so it doubles as a [[transduce]] reducing function."
  ([] {:visited #{} :deps []})
  ([acc] acc)
  ([a b] {:visited (into (:visited a) (:visited b))
          :deps    (into (:deps a) (:deps b))}))

(defn- collect-dependencies
  "Runs the same collection-filtered extract queries the export will run, without serializing or writing, and returns
   `{:visited #{[model id]}, :deps [...]}`: the content entities that will actually be extracted and every dependency
   they reference. Maps each entity to its [[entity-deps]] contribution and folds them with the [[merge-deps]] monoid,
   iterating `[model id-batch]` pairs so each query's `:in :id` clause stays bounded.

  This is the dependency-satisfaction equivalent of the real extraction pass: it shares the extract queries and the
  per-model dependency derivation, differing only in that it neither serializes nor stores anything."
  [by-model coll-set opts]
  (let [content-models (set serdes.models/content)]
    (transduce
     (comp
      (filter #(contains? content-models (key %)))
      (mapcat resize-batch)
      (mapcat (fn [[model batch]]
                (serdes/extract-query model (merge opts {:collection-set coll-set
                                                         :where          [:in :id batch]}))))
      (map entity-deps))
     merge-deps
     by-model)))

(defn- existing-ids
  "The subset of `ids` that exist as rows of `model` (a model-name string), queried in bounded `:in` batches."
  [model ids]
  (into #{}
        (mapcat #(t2/select-pks-set (keyword "model" model) {:where [:in :id %]}))
        (partition-all query-batch-size (distinct ids))))

(defn- unsatisfied-dependencies
  "Given collected `deps`, the `visited` set, and `analytics-cards`, returns the deps that won't be satisfied in the
   archive: `:content` references to exported models that aren't in `visited`, and `:data` references (database, table,
   field) whose row is missing from the appdb. Content references to models that aren't themselves exported as content
   are ignored — they can't dangle."
  [deps visited analytics-cards]
  (let [{content-deps :content data-deps :data} (group-by :kind deps)
        content-models (set serdes.models/content)
        existing       (into {}
                             (for [[model items] (group-by :model data-deps)]
                               [model (existing-ids model (map :id items))]))]
    (concat
     (remove (fn [{:keys [model id]}]
               (or (not (contains? content-models model))
                   (contains? visited [model id])
                   (and (= model "Card") (contains? analytics-cards id))))
             content-deps)
     (remove (fn [{:keys [model id]}]
               (contains? (get existing model) id))
             data-deps))))

(defn- unsatisfied-label [{:keys [kind model id via]}]
  (format "%s references %s %s which %s"
          (entity-label {:model (keyword "model" (first via)) :id (second via)})
          model id
          (case kind
            :content "is not included in the export"
            :data    "is missing from the source database")))

(defn- validate-dependencies!
  "Validates that every entity to be extracted has all of its references satisfied. Logs a warning per unsatisfied
   reference and, unless `continue-on-error?`, throws to abort the export before any archive is produced.

  Arguments:
    - `by-model` is a map of `{model-name [ids ...]}`

  Content references must be part of the export (or be analytics cards, which resolve on import); data-model
  references must exist in the source appdb. A missing reference would otherwise become a dangling reference or a
  malformed portable id in the archive, breaking the import."
  [by-model coll-set analytics-cards opts]
  (let [{:keys [visited deps]} (collect-dependencies by-model coll-set opts)
        missing               (unsatisfied-dependencies deps visited analytics-cards)]
    (when (seq missing)
      (doseq [m missing]
        (log/warnf "Failed to export: %s" (unsatisfied-label m)))
      (when-not (:continue-on-error opts)
        (throw (ex-info (format (str "Serialization failed: %d reference(s) could not be satisfied, which would "
                                     "produce an incomplete export. See the warnings above for the affected "
                                     "entities. Pass continue-on-error to export anyway, skipping them.")
                                (count missing))
                        {:status-code 400}))))))

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
      (validate-dependencies! by-model coll-set analytics-cards opts)) ;; may throw
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
                                                                   :where          [:in :id ids]})))
          extract-all     (fn [model]
                            (serdes/extract-all model (assoc opts :collection-set coll-set)))]
      (eduction cat
                [(if (seq targets)
                   (eduction (map extract-by-ids) cat by-model)
                   (eduction (map extract-all) cat (set/intersection (set serdes.models/content) models)))
                 ;; extract all non-content entities like data model and settings if necessary
                 (eduction (map #(serdes/extract-all % opts)) cat (remove (set serdes.models/content) models))]))))

(defn- needs-version?
  "True for extracted entities that should carry a `:metabase_version` stamp."
  [entity]
  (and (not (instance? Exception entity))
       (not= "Setting" (-> entity :serdes/meta last :model))))

(defn- stamp-version [entity]
  (if (needs-version? entity)
    (assoc entity :metabase_version config/mb-version-string)
    entity))

(defn extract
  "Returns a reducible stream of entities to serialize"
  [opts]
  (serdes.backfill/backfill-ids!)
  (eduction (map stamp-version) (extract-subtrees opts)))

(comment
  (def nodes (let [colls (mapv vector (repeat "Collection") (collection-set-for-user nil))]
               (merge
                (u/traverse colls #(serdes/ascendants (first %) (second %)))
                (u/traverse colls #(serdes/descendants (first %) (second %) {})))))
  (def by-model (u/group-by first second (keys nodes)))
  ;; continue-on-error so this just logs in the REPL instead of throwing
  (validate-dependencies! by-model (get by-model "Collection")
                          (analytics-card-ids (get by-model "Card"))
                          {:continue-on-error true}))
