(ns metabase-enterprise.data-sensitivity.db
  "Application database queries for the data-sensitivity module. Every function here is a direct Toucan 2 call
  with no additional logic."
  (:require
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-suggestion :as suggestion]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(mu/defn active-field-count :- ms/IntGreaterThanOrEqualToZero
  "The number of fields [[active-fields]] returns over the tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (if (seq table-ids)
    (t2/count :model/Field
              {:from  [(warehouse-schema-overlay/field-query)]
               :where [:and
                       [:in :table_id table-ids]
                       [:= :active true]
                       [:not= :visibility_type "retired"]
                       [:= :nfc_path nil]
                       [:= :parent_id nil]]})
    0))

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

;;; Metadata generation runs

(mu/defn insert-run! :- (ms/InstanceOf :model/MetadataGenerationRun)
  "Insert a MetadataGenerationRun and return it."
  [run :- ::run/new-run]
  (t2/insert-returning-instance! :model/MetadataGenerationRun run))

(mu/defn run :- [:maybe (ms/InstanceOf :model/MetadataGenerationRun)]
  "The MetadataGenerationRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/MetadataGenerationRun :id run-id))

(mu/defn run-status :- [:maybe :keyword]
  "The status of the MetadataGenerationRun with `run-id`, or nil when it does not exist."
  [run-id :- ms/PositiveInt]
  (t2/select-one-fn :status :model/MetadataGenerationRun :id run-id))

(mu/defn active-run :- [:maybe (ms/InstanceOf :model/MetadataGenerationRun)]
  "The active MetadataGenerationRun of `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/MetadataGenerationRun :database_id database-id :is_active true))

(mu/defn latest-runs :- [:sequential (ms/InstanceOf :model/MetadataGenerationRun)]
  "The 20 newest MetadataGenerationRuns of `database-id`, newest first."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/MetadataGenerationRun :database_id database-id {:order-by [[:id :desc]] :limit 20}))

(mu/defn update-run-with-status! :- :int
  "Apply `changes` to the MetadataGenerationRun with `run-id` when its status is `status`. Returns the number of rows
  updated."
  [run-id  :- ms/PositiveInt
   status  :- :keyword
   changes :- ::run/changes]
  (t2/update! :model/MetadataGenerationRun :id run-id :status status changes))

(mu/defn update-active-run! :- :int
  "Apply `changes` to the MetadataGenerationRun with `run-id` when it is active. Returns the number of rows updated."
  [run-id  :- ms/PositiveInt
   changes :- ::run/changes]
  (t2/update! :model/MetadataGenerationRun :id run-id :is_active true changes))

(mu/defn canceling-run-ids :- [:set ms/PositiveInt]
  "The ids among `run-ids` of the MetadataGenerationRuns whose status is `canceling`."
  [run-ids :- [:sequential ms/PositiveInt]]
  (if (seq run-ids)
    (set (t2/select-pks-set :model/MetadataGenerationRun :id [:in run-ids] :status :canceling))
    #{}))

(mu/defn record-table! :- :boolean
  "In one transaction, apply `changes` to the active MetadataGenerationRun with `run-id` and insert `suggestions`.
  When the run is not active, writes nothing and returns false."
  [run-id      :- ms/PositiveInt
   changes     :- ::run/changes
   suggestions :- [:sequential ::suggestion/new-suggestion]]
  (t2/with-transaction [_conn]
    (if (pos? (update-active-run! run-id changes))
      (do (when (seq suggestions)
            (t2/insert! :model/MetadataGenerationSuggestion suggestions))
          true)
      false)))
