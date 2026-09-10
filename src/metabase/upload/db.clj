(ns metabase.upload.db
  "Application database queries for the upload module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.core :as warehouse-schema]
   [metabase.warehouse-schema.humanization :as humanization]
   [toucan2.core :as t2]))

(mu/defn current-database
  "The Database being used for uploads, or nil."
  []
  (t2/select-one :model/Database :uploads_enabled true))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-is-attached-dwh?
  "Whether the Database with `database-id` is an attached data warehouse."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :is_attached_dwh :model/Database database-id))

(mu/defn disable-uploads-for-all-databases!
  "Disable uploads on every Database that has them enabled."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled      false
                                                     :uploads_schema_name  nil
                                                     :uploads_table_prefix nil}))

(mu/defn enable-uploads-for-database!
  "Enable uploads on the Database with `database-id` into `schema-name` with `table-prefix`."
  [database-id  :- ::lib.schema.id/database
   schema-name  :- [:maybe :string]
   table-prefix :- [:maybe :string]]
  (t2/update! :model/Database database-id {:uploads_enabled      true
                                           :uploads_schema_name  schema-name
                                           :uploads_table_prefix table-prefix}))

(mu/defn active-fields-for-table
  "The active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true))

(mu/defn user-edited-field-names
  "The lower-cased `names`, among the Fields of the Table with `table-id`, that have a user-set display name
  recorded in FieldUserSettings."
  [table-id :- ::lib.schema.id/table
   names    :- [:set :string]]
  (t2/select-fn-set (comp u/lower-case-en :name)
                    :model/Field
                    {:select    [:f.name]
                     :from      [[(t2/table-name :model/Field) :f]]
                     :left-join (warehouse-schema/field-user-settings-join :f :u)
                     :where     [:and
                                 [:= :f.table_id table-id]
                                 [:in [:lower :f.name] names]
                                 [:not= :u.display_name nil]]}))

(mu/defn set-field-display-names!
  "Set the display name of each Field of the Table with `table-id` whose lower-cased name is a key of
  `name->display-name` to the corresponding value, unless the Field has a user-set display name recorded in
  FieldUserSettings or its display name is not the automatic humanization of its name (in which case it is left
  alone)."
  [table-id           :- ::lib.schema.id/table
   name->display-name :- [:map-of :string :string]]
  (let [user-edited        (user-edited-field-names table-id (set (keys name->display-name)))
        name->display-name (apply dissoc name->display-name user-edited)]
    (when (seq name->display-name)
      ;; A raw update rather than `t2/update!`, which produces an invalid query for certain versions of
      ;; PostgreSQL: SELECT * FROM "metabase_field" WHERE "id" AND ("table_id" = ?) AND ... (argument of AND
      ;; must be type boolean).
      (t2/query {:update (t2/table-name :model/Field)
                 :set    {:display_name (into [:case]
                                              (mapcat identity)
                                              (for [[n display-name] name->display-name]
                                                [[:= [:lower :name] n]
                                                 [:case
                                                  [:= :display_name (humanization/name->human-readable-name n)] display-name
                                                  :else                                                       :display_name]]))}
                 :where  [:and
                          [:= :table_id table-id]
                          [:in [:lower :name] (keys name->display-name)]]}))))

(mu/defn mark-table-upload!
  "Flag the Table with `table-id` as an authoritative, writable upload table."
  [table-id :- ::lib.schema.id/table]
  (t2/update! :model/Table table-id {:is_upload      true
                                     :data_authority :authoritative
                                     :data_source    :upload
                                     :is_writable    true}))

(mu/defn set-field-display-name!
  "Set the display name of the Field with `field-id`."
  [field-id     :- ::lib.schema.id/field
   display-name :- :string]
  (t2/update! :model/Field field-id {:display_name display-name}))

(mu/defn unarchived-models-for-table
  "The id, query, and schema of the unarchived model Cards of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Card :id :dataset_query :card_schema]
             :table_id table-id
             :type     :model
             :archived false))

(mu/defn card-query-and-metadata
  "The query, result metadata, and schema of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :dataset_query :result_metadata :card_schema] card-id))

(mu/defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::queries.schema/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(mu/defn deactivate-table!
  "Mark the Table with `table-id` inactive."
  [table-id :- ::lib.schema.id/table]
  (t2/update! :model/Table :id table-id {:active false}))

(mu/defn archive-cards-for-table!
  "Archive the unarchived Cards of the Table with `table-id`, returning their ids."
  [table-id :- ::lib.schema.id/table]
  (t2/update-returning-pks! :model/Card {:table_id table-id :archived false} {:archived true}))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))
