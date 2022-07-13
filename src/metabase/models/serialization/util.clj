(ns metabase.models.serialization.util
  "Helpers intended to be shared by various models.
  Most of these are common operations done while (de)serializing several models, like handling a foreign key on a Table
  or user."
  (:require [metabase.models.serialization.base :as serdes.base]
            [toucan.db :as db]
            [toucan.models :as models]))

;; -------------------------------------------- General Foreign Keys -------------------------------------------------
(defn export-fk
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`."
  [id model]
  (let [model-name (name model)
        model      (db/resolve-model (symbol model-name))
        entity     (db/select-one model (models/primary-key model) id)
        {eid :id}  (serdes.base/infer-self-path model-name entity)]
    eid))

(defn import-fk
  "Given an entity ID or identity hash, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (let [model-name (name model)
        model      (db/resolve-model (symbol model-name))
        entity     (serdes.base/lookup-by-id model eid)]
    (if entity
      (get entity (models/primary-key model))
      (throw (ex-info "Could not find foreign key target - bad serdes-dependencies or other serialization error"
                      {:entity_id eid :model (name model)})))))

(defn export-fk-keyed
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `User.email`, `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :creator_id export-fk-keyed 'User :email).

  Note: This assumes the primary key is called `:id`."
  [id model field]
  (db/select-one-field field model :id id))

(defn import-fk-keyed
  "Given a single, portable, identifying field and the model it refers to, this resolves the entity and returns its
  numeric `:id`.
  Eg. `User.email` or `Database.name`.

  Unusual parameter order lets this be called as, for example, `(update x :creator_id import-fk-keyed 'User :email)`."
  [portable model field]
  (db/select-one-id model field portable))

;; -------------------------------------------------- Tables ---------------------------------------------------------
(defn export-table-fk
  "Given a numeric `table_id`, return a portable table reference.
  That has the form `[db-name schema table-name]`, where the `schema` might be nil.
  [[import-table-fk]] is the inverse."
  [table-id]
  (let [{:keys [db_id name schema]} (db/select-one 'Table :id table-id)
        db-name                     (db/select-one-field :name 'Database :id db_id)]
    [db-name schema name]))

(defn import-table-fk
  "Given a `table_id` as exported by [[export-table-fk]], resolve it back into a numeric `table_id`."
  [[db-name schema table-name]]
  (db/select-one-field :id 'Table :name table-name :schema schema :db_id (db/select-one-id 'Database :name db-name)))

(defn table->path
  "Given a `table_id` as exported by [[export-table-fk]], turn it into a `[{:model ...}]` path for the Table.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

;; -------------------------------------------------- Fields ---------------------------------------------------------
(defn export-field-fk
  "Given a numeric `field_id`, return a portable field reference.
  That has the form `[db-name schema table-name field-name]`, where the `schema` might be nil.
  [[import-field-fk]] is the inverse."
  [field-id]
  (let [{:keys [name table_id]}     (db/select-one 'Field :id field-id)
        [db-name schema field-name] (export-table-fk table_id)]
    [db-name schema field-name name]))

(defn import-field-fk
  "Given a `field_id` as exported by [[export-field-fk]], resolve it back into a numeric `field_id`."
  [[db-name schema table-name field-name]]
  (let [table_id (import-table-fk [db-name schema table-name])]
    (db/select-one-id 'Field :table_id table_id :name field-name)))

(defn field->path
  "Given a `field_id` as exported by [[export-field-fk]], turn it into a `[{:model ...}]` path for the Field.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))
