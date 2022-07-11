(ns metabase.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-dimension-projections`."
  (:require [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(def dimension-types
  "Possible values for `Dimension.type`"
  #{:internal
    :external})

(models/defmodel Dimension :dimension)

(u/strict-extend (class Dimension)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true
                                   :entity_id    true})})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [(serdes.hash/hydrated-hash :field)
                                      (serdes.hash/hydrated-hash :human_readable_field)])})

;;; ------------------------------------------------- Serialization --------------------------------------------------
(defn- foreign-field [field_id]
  (let [{:keys [table_id db_id name]}     (db/select-one 'Field :id field_id)
        {schema :schema table-name :name} (db/select-one 'Table :id table_id)
        db-name                           (db/select-one-field :name 'Database :id db_id)]
    (filterv some? [db-name schema table-name name])))

(defn- resolve-field [field]
  (let [[db-name schema table-name field-name] (case (count field)
                                                 4 field
                                                 3 nil)]) ; START HERE - extract these to utils
  )

(defmethod serdes.base/extract-one "Dimension"
  [_ _ {:keys [field_id human_readable_field_id] :as dim}]
  ;; The field IDs are converted to {:field [DB (schema) table field]} portable values.
  (cond-> (serdes.base/extract-one-basics "Dimension" dim)
    true (dissoc :field_id :human_readable_field_id)
    true (assoc :field (foreign-field field_id))
    human_readable_field_id (assoc :human_readable_field (foreign-field human_readable_field_id))))

(defmethod serdes.base/load-xform "Dimension"
  [{:keys [field human_readable_field] :as card}]
  (let [field_id                (resolve-field field)
        human_readable_field_id (when human_readable_field
                                  (resolve-field human_readable_field))
        db-id    (db/select-one-id 'Database :name db-name)
        table-id (db/select-one-id 'Table :database_id db-id :schema schema :name table-name)
        coll-id  (serdes.base/lookup-by-id 'Collection collection-eid)
        user-id  (db/select-one-id 'User :email email)]
    (-> card
        serdes.base/load-xform-basics
        (dissoc :table)
        (assoc :database_id   db-id
               :table_id      table-id
               :collection_id coll-id
               :creator_id    user-id))))

(defmethod serdes.base/serdes-dependencies "Card"
  [{[db-name schema table-name] :table
    :keys [collection_id]}]
  ;; The Table implicitly depends on the Database.
  [(filterv some? [{:model "Database" :id db-name}
                   (when schema {:model "Schema" :id schema})
                   {:model "Table" :id table-name}])
   [{:model "Collection" :id collection_id}]])
