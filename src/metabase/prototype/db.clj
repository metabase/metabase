(ns metabase.prototype.db
  "App DB queries for the prototype module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(def database-name
  "Name of the Database that holds the prototype dataset."
  "Prototype Data")

(mu/defn prototype-database
  "The prototype Database, or nil."
  []
  (t2/select-one :model/Database :name database-name :engine :postgres))

(mu/defn prototype-database-id :- [:maybe ::lib.schema.id/database]
  "The id of the prototype Database, or nil."
  []
  (t2/select-one-pk :model/Database :name database-name :engine :postgres))

(mu/defn insert-prototype-database!
  "Insert the prototype Database and return it."
  [details :- ::warehouses.schema/database.details]
  (t2/insert-returning-instance! :model/Database
                                 :name    database-name
                                 :engine  :postgres
                                 :details details))

(mu/defn update-database-details!
  "Set the `details` of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   details     :- ::warehouses.schema/database.details]
  (t2/update! :model/Database database-id {:details details}))

(mu/defn table-ids-by-name :- [:map-of :string ::lib.schema.id/table]
  "Map of table name to id for the tables of the Database with `database-id` in `schema`."
  [database-id :- ::lib.schema.id/database
   schema      :- :string]
  (t2/select-fn->pk :name :model/Table :db_id database-id :schema schema :active true
                    {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn field-ids-by-name :- [:map-of :string ::lib.schema.id/field]
  "Map of field name to id for the top-level fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn->pk :name :model/Field :table_id table-id :parent_id nil
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn set-field-semantic-type!
  "Set the semantic type of the Field with `field-id` as a user value, so that sync does not change it. A nil
  semantic type is a user value too: the Field has no semantic type."
  [field-id      :- ::lib.schema.id/field
   semantic-type :- [:maybe :keyword]]
  (if (t2/exists? :model/FieldUserSettings field-id)
    (t2/update! :model/FieldUserSettings field-id {:semantic_type semantic-type})
    (t2/insert! :model/FieldUserSettings {:field_id field-id, :semantic_type semantic-type})))

(mu/defn set-table-display-name!
  "Set the display name of the Table with `table-id` as a user value, the same as an edit in the data model."
  [table-id     :- ::lib.schema.id/table
   display-name :- :string]
  (if (t2/exists? :model/TableUserSettings table-id)
    (t2/update! :model/TableUserSettings table-id {:display_name display-name})
    (t2/insert! :model/TableUserSettings {:table_id table-id, :display_name display-name})))

(mu/defn set-field-description!
  "Set the description of the Field with `field-id` as a user value, the same as an edit in the data model."
  [field-id    :- ::lib.schema.id/field
   description :- :string]
  (if (t2/exists? :model/FieldUserSettings field-id)
    (t2/update! :model/FieldUserSettings field-id {:description description})
    (t2/insert! :model/FieldUserSettings {:field_id field-id, :description description})))

(mu/defn first-admin-id :- [:maybe ::lib.schema.id/user]
  "The id of the first active admin, or nil before the setup."
  []
  (t2/select-one-pk :model/User :is_superuser true :is_active true {:order-by [[:id :asc]]}))

(defn upsert-segment!
  "Insert or update the Segment named `segment-name` on the Table `table-id`. Returns its id."
  [table-id segment-name {:keys [description definition creator-id]}]
  (if-let [id (t2/select-one-pk :model/Segment :table_id table-id :name segment-name)]
    (do (t2/update! :model/Segment id {:description description :definition definition :archived false})
        id)
    (t2/insert-returning-pk! :model/Segment {:table_id    table-id
                                             :name        segment-name
                                             :description description
                                             :definition  definition
                                             :creator_id  creator-id})))

(defn upsert-measure!
  "Insert or update the Measure named `measure-name` on the Table `table-id`. Returns its id."
  [table-id measure-name {:keys [description definition creator-id]}]
  (if-let [id (t2/select-one-pk :model/Measure :table_id table-id :name measure-name)]
    (do (t2/update! :model/Measure id {:description description :definition definition :archived false})
        id)
    (t2/insert-returning-pk! :model/Measure {:table_id    table-id
                                             :name        measure-name
                                             :description description
                                             :definition  definition
                                             :creator_id  creator-id})))

(defn upsert-glossary-entry!
  "Insert or update the glossary entry for `term`."
  [term definition creator-id]
  (if-let [id (t2/select-one-pk :model/Glossary :term term)]
    (t2/update! :model/Glossary id {:definition definition})
    (t2/insert! :model/Glossary {:term term :definition definition :creator_id creator-id})))

(defn upsert-ai-context!
  "Insert or replace the AI context of the entity with `entity-type` (\"table\", \"segment\", ...) and `entity-id`."
  [entity-type entity-id ai-context]
  (if (t2/exists? :model/OsiAiContext :entity_type entity-type :entity_local_id entity-id)
    (t2/update! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-id {:ai_context ai-context})
    (t2/insert! :model/OsiAiContext {:entity_type     entity-type
                                     :entity_local_id entity-id
                                     :ai_context      ai-context})))

(defn saved-query-dataset-queries
  "The `dataset_query` JSON strings of all MBQL cards that are not archived. Prototype: reads the table directly,
  with no permission check, so the prototype module does not need the Card model."
  []
  (t2/select-fn-vec :dataset_query [:report_card :dataset_query]
                    :archived false :query_type "query"))

(mu/defn field-id->table-id :- [:map-of ::lib.schema.id/field ::lib.schema.id/table]
  "Map of field id to table id for `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (if (empty? field-ids)
    {}
    (t2/select-pk->fn :table_id :model/Field :id [:in field-ids]
                      {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]})))
