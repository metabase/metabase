(ns metabase-enterprise.replacement.entity
  "The entities that a replacement touches, through the replacement spec of the model of each entity type."
  (:require
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase.dependencies.core :as dependencies]
   [metabase.replacement.spec :as replacement.spec]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- entity-model
  "The model of `entity-type` when it has a replacement spec, or nil."
  [entity-type]
  (when-let [model (dependencies/entity-model entity-type)]
    (when (replacement.spec/spec model)
      model)))

(defn entity-spec
  "The replacement spec of the model of `entity-type`, or nil."
  [entity-type]
  (some-> (entity-model entity-type) replacement.spec/spec))

(defn row
  "The row of the entity `[entity-type id]` when its model has a replacement spec, or nil."
  [[entity-type id]]
  (when-let [model (entity-model entity-type)]
    (replacement.db/row model id)))

(defn source-database-id
  "The id of the database of the source `[entity-type id]`, through the `:source-database-id` of the replacement spec
  of its model."
  [[entity-type id :as source]]
  (let [database-id (or (:source-database-id (entity-spec entity-type))
                        (throw (ex-info (str "Not a replacement source: " entity-type) {:source source})))]
    (database-id (replacement.db/row (entity-model entity-type) id))))

(defn rows-by-entity
  "The rows of `entities`, each `[entity-type id]`, as `{[entity-type id] row}`, loaded in one query per entity type
  whose model has a replacement spec."
  [entities]
  (into {}
        (for [[entity-type refs] (group-by first entities)
              :let  [model (entity-model entity-type)]
              :when model
              row   (replacement.db/rows model (mapv second refs))]
          [[entity-type (:id row)] row])))

(defn hydrated
  "The `row` hydrated by the `:hydrate` of `spec`, or `row` itself when it has none."
  [spec row]
  (if-let [hydrate (:hydrate spec)]
    (first (hydrate [row]))
    row))

(mu/defn apply-writes!
  "Apply `writes`, each an update of the row of a model with an id, in order."
  [writes :- replacement.spec/Writes]
  (doseq [[model id changes] writes]
    (replacement.db/update-row! model id changes)))
