(ns metabase-enterprise.data-sensitivity.db
  "Application database queries for the data-sensitivity module. Every function here is a direct Toucan 2 call
  with no additional logic."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn active-table
  "The active Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id :active true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-schema?
  "Whether the Database with `database-id` has an active Table in `schema`."
  [database-id :- ::lib.schema.id/database
   schema      :- :string]
  (t2/exists? :model/Table {:from  [(warehouse-schema-overlay/table-query)]
                            :where [:and [:= :db_id database-id] [:= :active true] [:= :schema schema]]}))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn active-fields
  "The active, non-retired, top-level Fields of `table-id`, ordered by position then id. Hidden and sensitive fields
  are included. JSON child fields are excluded: SQL unfolding sets only `nfc_path`, Mongo sets `nfc_path` and
  `parent_id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field
             {:from     [(warehouse-schema-overlay/field-query)]
              :where    [:and
                         [:= :table_id table-id]
                         [:= :active true]
                         [:not= :visibility_type "retired"]
                         [:= :nfc_path nil]
                         [:= :parent_id nil]]
              :order-by [[:position :asc] [:id :asc]]}))

(mu/defn user-settings-by-field
  "A map of field id to its FieldUserSettings row, for the ids in `field-ids` that have one."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (if (seq field-ids)
    (into {} (map (juxt :field_id identity)) (t2/select :model/FieldUserSettings :field_id [:in field-ids]))
    {}))

(mu/defn field-names-and-tables
  "The id, name, and table id of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :name :table_id] :id [:in field-ids]
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn tables-by-id
  "A map of table id to the id, name, and schema of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (into {} (map (juxt :id identity)) (t2/select [:model/Table :id :name :schema] :id [:in table-ids]
                                                {:from [(warehouse-schema-overlay/table-query)]})))

(mu/defn active-tables
  "The active Tables of `database-id`, restricted to `schema` when it is non-nil, ordered by schema then name."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/select :model/Table
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    (cond-> [:and [:= :db_id database-id] [:= :active true]]
                          schema (conj [:= :schema schema]))
              :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn commit-labels!
  "In one transaction, set the `data_sensitivity` of every Field in `field-ids-by-label` to its label."
  [field-ids-by-label :- [:map-of ::lib.schema.metadata/column.data-sensitivity [:sequential ::lib.schema.id/field]]]
  (t2/with-transaction [_conn]
    (doseq [[label field-ids] field-ids-by-label]
      (t2/update! :model/Field :id [:in field-ids] {:data_sensitivity label}))))
