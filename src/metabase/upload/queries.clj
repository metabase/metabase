(ns metabase.upload.queries
  "Application database queries for the upload module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn uploads-database
  "The Database with uploads enabled, or nil."
  []
  (t2/select-one :model/Database :uploads_enabled true))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn database-is-attached-dwh?
  "Whether the Database with `database-id` is an attached data warehouse."
  [database-id]
  (t2/select-one-fn :is_attached_dwh :model/Database database-id))

(defn disable-uploads-for-all-databases!
  "Disable uploads on every Database that has them enabled."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled      false
                                                     :uploads_schema_name  nil
                                                     :uploads_table_prefix nil}))

(defn enable-uploads-for-database!
  "Enable uploads on the Database with `database-id` into `schema-name` with `table-prefix`."
  [database-id schema-name table-prefix]
  (t2/update! :model/Database database-id {:uploads_enabled      true
                                           :uploads_schema_name  schema-name
                                           :uploads_table_prefix table-prefix}))

(defn active-fields-for-table
  "The active Fields of the Table with `table-id`."
  [table-id]
  (t2/select :model/Field :table_id table-id :active true))

(defn set-field-display-names!
  "Set the display names of the Fields of the Table with `table-id` whose lower-cased name is in `lower-case-names`
  to the Honey SQL `display-name-expr`."
  [table-id display-name-expr lower-case-names]
  ;; A raw update rather than `t2/update!`, which produces an invalid query for certain versions of PostgreSQL:
  ;; SELECT * FROM "metabase_field" WHERE "id" AND ("table_id" = ?) AND ... (argument of AND must be type boolean).
  (t2/query {:update (t2/table-name :model/Field)
             :set    {:display_name display-name-expr}
             :where  [:and
                      [:= :table_id table-id]
                      [:in [:lower :name] lower-case-names]]}))

(defn mark-table-upload!
  "Flag the Table with `table-id` as an authoritative, writable upload table."
  [table-id]
  (t2/update! :model/Table table-id {:is_upload      true
                                     :data_authority :authoritative
                                     :data_source    :upload
                                     :is_writable    true}))

(defn set-field-display-name!
  "Set the display name of the Field with `field-id`."
  [field-id display-name]
  (t2/update! :model/Field field-id {:display_name display-name}))

(defn unarchived-models-for-table
  "The id, query, and schema of the unarchived model Cards of the Table with `table-id`."
  [table-id]
  (t2/select [:model/Card :id :dataset_query :card_schema]
             :table_id table-id
             :type     :model
             :archived false))

(defn card-query-and-metadata
  "The query, result metadata, and schema of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :dataset_query :result_metadata :card_schema] card-id))

(defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`."
  [card-id result-metadata]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(defn deactivate-table!
  "Mark the Table with `table-id` inactive."
  [table-id]
  (t2/update! :model/Table :id table-id {:active false}))

(defn archive-cards-for-table!
  "Archive the unarchived Cards of the Table with `table-id`, returning their ids."
  [table-id]
  (t2/update-returning-pks! :model/Card {:table_id table-id :archived false} {:archived true}))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn hydrate-db
  "Hydrate `:db` onto `tables`."
  [tables]
  (t2/hydrate tables :db))
