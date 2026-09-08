(ns metabase.upload.db
  "Application database queries for the upload module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.models.humanization :as humanization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn current-database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database being used for uploads, or nil."
  []
  (t2/select-one :model/Database :uploads_enabled true))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-is-attached-dwh? :- [:maybe :boolean]
  "Whether the Database with `database-id` is an attached data warehouse."
  [database-id :- ms/PositiveInt]
  (t2/select-one-fn :is_attached_dwh :model/Database database-id))

(mu/defn disable-uploads-for-all-databases! :- :int
  "Disable uploads on every Database that has them enabled."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled      false
                                                     :uploads_schema_name  nil
                                                     :uploads_table_prefix nil}))

(mu/defn enable-uploads-for-database! :- :int
  "Enable uploads on the Database with `database-id` into `schema-name` with `table-prefix`."
  [database-id  :- ms/PositiveInt
   schema-name  :- [:maybe :string]
   table-prefix :- [:maybe :string]]
  (t2/update! :model/Database database-id {:uploads_enabled      true
                                           :uploads_schema_name  schema-name
                                           :uploads_table_prefix table-prefix}))

(mu/defn active-fields-for-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :active true))

(mu/defn set-field-display-names! :- [:sequential :int]
  "Set the display name of each Field of the Table with `table-id` whose lower-cased name is a key of
  `name->display-name` to the corresponding value, unless its current display name no longer matches the
  automatic humanization of its name (i.e. it was manually edited, in which case it is left alone)."
  [table-id           :- ms/PositiveInt
   name->display-name :- [:map-of :string :string]]
  ;; A raw update rather than `t2/update!`, which produces an invalid query for certain versions of PostgreSQL:
  ;; SELECT * FROM "metabase_field" WHERE "id" AND ("table_id" = ?) AND ... (argument of AND must be type boolean).
  (t2/query {:update (t2/table-name :model/Field)
             :set    {:display_name (into [:case]
                                          (mapcat identity)
                                          (for [[n display-name] name->display-name]
                                            [[:= [:lower :name] n]
                                             [:case
                                              ;; Only update the display name if it still matches the automatic humanization.
                                              [:= :display_name (humanization/name->human-readable-name n)] display-name
                                              ;; Otherwise, it could have been set manually, so leave it as is.
                                              true                                                          :display_name]]))}
             :where  [:and
                      [:= :table_id table-id]
                      [:in [:lower :name] (keys name->display-name)]]}))

(mu/defn mark-table-upload! :- :int
  "Flag the Table with `table-id` as an authoritative, writable upload table."
  [table-id :- ms/PositiveInt]
  (t2/update! :model/Table table-id {:is_upload      true
                                     :data_authority :authoritative
                                     :data_source    :upload
                                     :is_writable    true}))

(mu/defn set-field-display-name! :- :int
  "Set the display name of the Field with `field-id`."
  [field-id     :- ms/PositiveInt
   display-name :- :string]
  (t2/update! :model/Field field-id {:display_name display-name}))

(mu/defn unarchived-models-for-table :- [:sequential (ms/InstanceOf :model/Card)]
  "The id, query, and schema of the unarchived model Cards of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select [:model/Card :id :dataset_query :card_schema]
             :table_id table-id
             :type     :model
             :archived false))

(mu/defn card-query-and-metadata :- [:maybe (ms/InstanceOf :model/Card)]
  "The query, result metadata, and schema of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :dataset_query :result_metadata :card_schema] card-id))

(mu/defn set-card-result-metadata! :- :int
  "Set the result metadata of the Card with `card-id`."
  [card-id         :- ms/PositiveInt
   result-metadata :- :any]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(mu/defn deactivate-table! :- :int
  "Mark the Table with `table-id` inactive."
  [table-id :- ms/PositiveInt]
  (t2/update! :model/Table :id table-id {:active false}))

(mu/defn archive-cards-for-table! :- [:sequential ms/PositiveInt]
  "Archive the unarchived Cards of the Table with `table-id`, returning their ids."
  [table-id :- ms/PositiveInt]
  (t2/update-returning-pks! :model/Card {:table_id table-id :archived false} {:archived true}))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in table-ids]))
