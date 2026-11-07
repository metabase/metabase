(ns metabase.serialization.dependencies
  "What an entity refers to: on import, what loads before it; on export, what an export must contain or find.

  - [[export-dependencies]]: the entities each of some rows depends on, which an export must contain or find.
  - [[import-dependencies]]: the entities each of some entities depends on, which an import loads first.
  - [[export-escapes]] and [[import-escapes]]: the dependencies of some entities that are not among them.

  Each names an entity by `[model id]` on export, the database id of its row, and by `[model ref]` on import, the
  way [[metabase.serialization.entity/key-of]] names an entity."
  (:require
   [clojure.set :as set]
   [metabase.serialization.entity :as serialization.entity]
   [metabase.serialization.mbql :as mbql]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.util :as serialization.util]
   [metabase.serialization.visualization-settings :as viz]
   [metabase.util.json :as json]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(declare ^:private mbql-deps-map)

(def ^:private export-opts
  "How the walkers read a row: positive integers are database ids, and so are excluded timeline events."
  {:id-ref?    pos-int?
   :event-ref? pos-int?
   :event-id   identity})

(def ^:private import-opts
  "How the walkers read an entity: integers are stray values, and excluded timeline events are entity ids, or the
  `[timeline-eid eid]` of older exports."
  {:id-ref?    (constantly false)
   :event-ref? mbql/entity-id?
   :event-id   viz/owned-entity-id})

(def ^:private mbql-ref-tag->model
  "The serdes model that a `:metric`/`:segment`/`:measure` MBQL reference clause depends on."
  {:metric :model/Card,       "metric"  :model/Card
   :segment :model/Segment,    "segment" :model/Segment
   :measure :model/Measure,    "measure" :model/Measure})

(defn- mbql-deps-vector [entity {:keys [id-ref?] :as opts}]
  (match/match-one entity
    [#{:field "field"} #'map? #'vector?]
    nil

    [(tag :guard #{:metric "metric" :segment "segment" :measure "measure"})
     (opts-map :guard map?)
     (field :guard mbql/entity-id?)]
    (into #{[(mbql-ref-tag->model tag) field]}
          (mbql-deps-map opts-map opts))

    [#{:field "field" :field-id "field-id"} (_ref :guard vector?) _opts]
    nil

    [(tag :guard #{:metric "metric" :segment "segment" :measure "measure"}) (field :guard mbql/entity-id?)]
    #{[(mbql-ref-tag->model tag) field]}

    [#{:field "field"} #'map? (id :guard (id-ref? id))]
    #{[:model/Field id]}

    [(tag :guard #{:metric "metric" :segment "segment" :measure "measure"})
     (opts-map :guard map?)
     (id :guard (id-ref? id))]
    (into #{[(mbql-ref-tag->model tag) id]}
          (mbql-deps-map opts-map opts))

    [#{:field "field" :field-id "field-id"} (id :guard (id-ref? id)) _opts]
    #{[:model/Field id]}

    [(tag :guard #{:metric "metric" :segment "segment" :measure "measure"}) (id :guard (id-ref? id))]
    #{[(mbql-ref-tag->model tag) id]}

    _ (reduce #(cond
                 (map? %2)    (into %1 (mbql-deps-map %2 opts))
                 (vector? %2) (into %1 (mbql-deps-vector %2 opts))
                 :else %1)
              #{}
              entity)))

(defn- mbql-deps-map [m {:keys [id-ref?] :as opts}]
  (into #{}
        (mapcat (fn [[k v]]
                  (cond
                    (and (= k :database) (string? v))               nil
                    (and (= k :source-table) (vector? v))           nil
                    (and (= k :source-table) (mbql/entity-id? v)) #{[:model/Card v]}
                    (and (= k :source-card)  (mbql/entity-id? v)) #{[:model/Card v]}
                    (and (= k :source-field) (vector? v))           nil
                    (and (= k :snippet-id)   (mbql/entity-id? v)) #{[:model/NativeQuerySnippet v]}
                    (and (= k :table-id)     (vector? v))           nil
                    (and (#{:card_id :card-id} k) (string? v))      #{[:model/Card v]}
                    (and (= k :database)     (id-ref? v))           #{[:model/Database v]}
                    (and (= k :source-table) (id-ref? v))           #{[:model/Table v]}
                    (and (= k :source-card)  (id-ref? v))           #{[:model/Card v]}
                    (and (= k :source-field) (id-ref? v))           #{[:model/Field v]}
                    (and (= k :snippet-id)   (id-ref? v))           #{[:model/NativeQuerySnippet v]}
                    (and (= k :table-id)     (id-ref? v))           #{[:model/Table v]}
                    (and (#{:card_id :card-id} k) (id-ref? v))      #{[:model/Card v]}
                    (map? v)                                        (mbql-deps-map v opts)
                    (vector? v)                                     (mbql-deps-vector v opts))))
        m))

(defn- mbql-deps
  "The `[model id]` of what an MBQL form refers to, read as [[export-opts]] or [[import-opts]] say."
  [entity opts]
  (cond
    (map? entity)     (mbql-deps-map entity opts)
    (seqable? entity) (mbql-deps-vector entity opts)
    :else             (mbql-deps-vector [entity] opts)))

(defn- parameters-deps
  "The `[model id]` of what `:parameters` refer to, read as [[export-opts]] or [[import-opts]] say."
  [parameters opts]
  (reduce set/union #{}
          (for [parameter parameters
                :when (= (keyword (:values_source_type parameter)) :card)
                :let  [config (:values_source_config parameter)]]
            (set/union #{[:model/Card (:card_id config)]}
                       (mbql-deps-vector (:value_field config) opts)))))

(defn- viz-link-card-deps
  [settings {:keys [id-ref?]}]
  (when-let [{:keys [model id]} (get-in settings [:link :entity])]
    (when (or (not (#{"table" "database"} model)) (id-ref? id))
      #{[(viz/link-card-model->toucan-model model) id]})))

(defn- viz-click-behavior-deps
  [settings]
  (let [{:keys [linkType targetId type]} (:click_behavior settings)
        model (when linkType (viz/link-card-model->toucan-model linkType))]
    (case type
      "link" (when model
               #{[model targetId]})
      nil)))

(defn- timeline-events-deps
  [settings {:keys [id-ref? event-ref? event-id]}]
  (let [selected-ids (viz/timeline-setting-ids (:timeline.selected_timeline_ids settings))
        excluded-ids (viz/timeline-setting-ids (:timeline.excluded_timeline_event_ids settings))]
    (into (into #{} (comp (filter #(or (id-ref? %) (mbql/entity-id? %))) (map (fn [id] [:model/Timeline id])))
                selected-ids)
          (comp (map event-id) (filter event-ref?) (map (fn [id] [:model/TimelineEvent id])))
          excluded-ids)))

(defn- visualization-settings-deps
  "The `[model id]` of what `:visualization_settings` refer to, read as [[export-opts]] or [[import-opts]] say."
  [viz opts]
  (let [column-settings-keys-deps (some->> viz
                                           :column_settings
                                           keys
                                           (map (comp #(mbql-deps % opts) json/decode name)))
        column-settings-vals-deps (some->> viz
                                           :column_settings
                                           vals
                                           (map viz-click-behavior-deps))]
    (->> (concat column-settings-keys-deps
                 column-settings-vals-deps
                 [(mbql-deps viz opts)
                  (viz-link-card-deps viz opts)
                  (viz-click-behavior-deps viz)
                  (timeline-events-deps viz opts)])
         (filter some?)
         (reduce set/union #{}))))

(defn export-mbql-dependencies
  "The `[model id]` of the cards, segments, measures, snippets, databases, tables and fields an MBQL form of a
  database row refers to by database id."
  [form]
  (mbql-deps form export-opts))

(defn import-mbql-dependencies
  "The `[model ref]` of the cards, segments, measures and snippets an MBQL form of an entity refers
  to."
  [form]
  (mbql-deps form import-opts))

(defn export-parameters-dependencies
  "The `[model id]` of what the `:parameters` of a database row refer to by database id."
  [parameters]
  (parameters-deps parameters export-opts))

(defn import-parameters-dependencies
  "The `[model ref]` of what the `:parameters` of an entity refer to."
  [parameters]
  (parameters-deps parameters import-opts))

(defn export-visualization-settings-dependencies
  "The `[model id]` of what the `:visualization_settings` of a database row refer to by database id."
  [settings]
  (visualization-settings-deps settings export-opts))

(defn import-visualization-settings-dependencies
  "The `[model ref]` of what the `:visualization_settings` of an entity refer to."
  [settings]
  (visualization-settings-deps settings import-opts))

(defmulti export-dependencies
  "For each of `rows`, database rows of `model`, the set of `[model id]` of the entities it depends on, which an export
  must contain or find."
  {:arglists '([model rows])}
  (fn [model _rows] model))

(defmethod export-dependencies :default [_ rows]
  (mapv (constantly #{}) rows))

(defmulti import-dependencies
  "For each of `entities`, entities of `model`, the set of `[model ref]` of the entities it depends on, which an import
  loads first."
  {:arglists '([model entities])}
  (fn [model _entities] model))

(defmethod import-dependencies :default [_ entities]
  (mapv (constantly #{}) entities))

(defn child-entities
  "The `[child-model entity]` of each child entity that `entity`, an entity of `model`, nests (see
  [[metabase.serialization.spec]]), with its `:serdes/meta`."
  [model entity]
  (for [[k child-model] (serialization.spec/children model)
        x (get entity k)]
    [child-model (assoc x :serdes/meta (serialization.entity/meta-of child-model))]))

(defn child-keys
  "The `[model entity-id]` keys of the child entities that `entity`, an entity of `model`, nests."
  [model entity]
  (into [] (keep (fn [[child-model x]] (some->> (:entity_id x) (vector child-model)))) (child-entities model entity)))

(defn import-dependencies-with-children
  "For each of `entities`, entities of `model`, the set of `[model ref]` of the entities it and its child entities
  depend on."
  [model entities]
  (let [children   (mapv #(child-entities model %) entities)
        child-deps (into {}
                         (for [[child-model xs] (group-by first (apply concat children))]
                           [child-model (zipmap (map second xs) (import-dependencies child-model (mapv second xs)))]))]
    (mapv (fn [deps cs]
            (into (set deps) (mapcat (fn [[m x]] (get-in child-deps [m x]))) cs))
          (import-dependencies model entities)
          children)))

(defn- escapes
  "The map from each dependency of the entities of `by-model`, a map of model to a reducible of them, that is not among
  them to the set of their keys depending on it. `batch-info` is a fn of a model and a batch of its entities, returning
  `{:seen keys :deps [[key dependencies] ...]}`."
  [by-model batch-info]
  (let [{:keys [seen deps]}
        (reduce-kv (fn [acc model entities]
                     (transduce (partition-all serialization.util/batch-size)
                                (completing
                                 (fn [acc batch]
                                   (let [{batch-seen :seen batch-deps :deps} (batch-info model batch)]
                                     (-> acc
                                         (update :seen into batch-seen)
                                         (update :deps (fn [m]
                                                         (reduce (fn [m [k ds]]
                                                                   (reduce #(update %1 %2 (fnil conj #{}) k) m ds))
                                                                 m
                                                                 batch-deps)))))))
                                acc
                                entities))
                   {:seen #{} :deps {}}
                   by-model)]
    (into {} (remove (comp seen key)) deps)))

(defn export-escapes
  "The map from each `[model id]` dependency of the rows of `rows-by-model`, a map of model to a reducible of its rows,
  that is not among them to the set of the `[model id]` of the rows depending on it."
  [rows-by-model]
  (escapes rows-by-model
           (fn [model rows]
             (let [pk  (serialization.spec/primary-key model)
                   ks  (mapv #(vector model (get % pk)) rows)]
               {:seen ks
                :deps (map vector ks (export-dependencies model rows))}))))

(defn import-escapes
  "The map from each `[model ref]` dependency of the entities of `entities-by-model`, a map of model to a reducible of
  them, and of their child entities, that is not among them to the set of the keys of the entities depending on it."
  [entities-by-model]
  (escapes entities-by-model
           (fn [model entities]
             (let [ks (mapv #(vector model (serialization.entity/entity-ref model %)) entities)]
               {:seen (into ks (mapcat #(child-keys model %)) entities)
                :deps (map vector ks (import-dependencies-with-children model entities))}))))
