(ns metabase-enterprise.data-sensitivity.db
  "Application database queries for the data-sensitivity module."
  (:require
   [metabase-enterprise.data-sensitivity.models.metadata-generation-proposal :as proposal]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn active-table
  "The active Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id :active true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(defn- active-fields-where
  "The `:where` of [[active-fields]] over the tables that `table-condition` selects."
  [table-condition]
  [:and
   table-condition
   [:= :active true]
   [:not= :visibility_type "retired"]
   [:= :nfc_path nil]
   [:= :parent_id nil]])

(mu/defn active-fields
  "The active, non-retired, top-level Fields of `table-id`, ordered by position then id. Hidden and sensitive fields
  are included. JSON child fields are excluded: SQL unfolding sets only `nfc_path`, Mongo sets `nfc_path` and
  `parent_id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field
             {:from     [(warehouse-schema-overlay/field-query)]
              :where    (active-fields-where [:= :table_id table-id])
              :order-by [[:position :asc] [:id :asc]]}))

(mu/defn active-field-count :- ms/IntGreaterThanOrEqualToZero
  "The number of fields [[active-fields]] returns over the tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (if (seq table-ids)
    (t2/count :model/Field
              {:from  [(warehouse-schema-overlay/field-query)]
               :where (active-fields-where [:in :table_id table-ids])})
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
  "The active Tables of `database-id`, ordered by schema then name."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:and [:= :db_id database-id] [:= :active true]]
              :order-by [[:schema :asc] [:name :asc]]}))

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
  "Apply `changes` to the MetadataGenerationRun with `run-id` when its status is `status`, or one of `status` when it
  is a set. One conditional update, so a concurrent status change cannot slip between a read and the write. Returns
  the number of rows updated."
  [run-id  :- ms/PositiveInt
   status  :- [:or ::run/status [:set ::run/status]]
   changes :- ::run/changes]
  (t2/update! :model/MetadataGenerationRun :id run-id :status (if (set? status) [:in status] status) changes))

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

(mr/def ::table-proposals
  "The proposals of one classified table for the `attributes` of a run."
  [:map {:closed true}
   [:table_id   ::lib.schema.id/table]
   [:attributes [:set ::run/attribute]]
   [:proposals  [:sequential ::proposal/new-proposal]]])

(defn- upsert-table-proposals!
  "Make the proposals of `table_id` for `attributes` the ones in `proposals`: a new proposal replaces the pending or
  rejected row of its field and attribute, and a row that `proposals` does not have is deleted. Rows of other tables
  and other attributes do not change. When an apply deletes an existing row before its update, the new proposal is
  inserted."
  [{:keys [table_id attributes proposals]}]
  (let [existing (into {}
                       (map (juxt (juxt :field_id :attribute) :id))
                       (t2/select [:model/MetadataGenerationProposal :id :field_id :attribute]
                                  :table_id table_id :attribute [:in attributes]))
        by-key   (into {} (map (juxt (juxt :field_id :attribute) identity)) proposals)
        gone     (vec (keep (fn [[k id]] (when-not (by-key k) id)) existing))]
    (when (seq gone)
      (t2/delete! :model/MetadataGenerationProposal :id [:in gone]))
    (when-let [inserts (not-empty
                        (into []
                              (filter (fn [p]
                                        (let [id (existing ((juxt :field_id :attribute) p))]
                                          (or (nil? id)
                                              (zero? (t2/update! :model/MetadataGenerationProposal id
                                                                 (assoc (select-keys p [:last_run_id :proposed_value
                                                                                        :confidence :reasoning])
                                                                        :status :pending
                                                                        :decided_by nil
                                                                        :decided_at nil)))))))
                              proposals))]
      (t2/insert! :model/MetadataGenerationProposal inserts))))

(mu/defn record-table! :- :boolean
  "In one transaction, apply `changes` to the active MetadataGenerationRun with `run-id` and, when `table-proposals`
  is non-nil, upsert the proposals of its table. When the run is not active, writes nothing and returns false."
  [run-id          :- ms/PositiveInt
   changes         :- ::run/changes
   table-proposals :- [:maybe ::table-proposals]]
  (t2/with-transaction [_conn]
    (if (pos? (update-active-run! run-id changes))
      (do (some-> table-proposals upsert-table-proposals!)
          true)
      false)))

(defenterprise delete-pending-semantic-type-proposal!
  "Delete the pending `semantic_type` proposal of the field with `field-id`. Sync calls this when it clears the AI
  semantic type of the field. Uses `:feature :none` so a lapsed token does not
  keep a proposal that no longer fits the field."
  :feature :none
  [field-id]
  (t2/delete! :model/MetadataGenerationProposal :field_id field-id :attribute :semantic_type :status :pending))

;;; Review

(mr/def ::scope
  "The proposals of the tables in `table_ids`, or of the tables of `database_id` (in `schema` when given). Given keys
  all apply."
  [:map {:closed true}
   [:database_id {:optional true} [:maybe ::lib.schema.id/database]]
   [:schema      {:optional true} [:maybe :string]]
   [:table_ids   {:optional true} [:maybe [:sequential ::lib.schema.id/table]]]])

(defn- pending-in-scope
  "The `:from`, `:join` and `:where` of a query over the pending proposals in `scope` of active fields of active
  tables, with the proposal table aliased `p`, the Table `t` and the Field `f`."
  [{:keys [database_id schema table_ids]}]
  {:from  [[:metadata_generation_proposal :p]]
   :join  [(warehouse-schema-overlay/table-query {:alias :t}) [:= :t.id :p.table_id]
           (warehouse-schema-overlay/field-query {:alias :f}) [:= :f.id :p.field_id]]
   :where (cond-> [:and [:= :p.status "pending"] [:= :t.active true] [:= :f.active true]]
            database_id     (conj [:= :t.db_id database_id])
            schema          (conj [:= :t.schema schema])
            (seq table_ids) (conj [:in :p.table_id table_ids]))})

(mu/defn pending-proposals :- [:sequential (ms/InstanceOf :model/MetadataGenerationProposal)]
  "The pending proposals in `scope` of active fields of active tables, with the field's `field_name`,
  `field_display_name`, `field_base_type` and `field_effective_type`, ordered by schema, table name, field position,
  field id and attribute."
  [scope :- ::scope]
  (t2/select :model/MetadataGenerationProposal
             (assoc (pending-in-scope scope)
                    :select   [:p.* [:f.name :field_name] [:f.display_name :field_display_name]
                               [:f.base_type :field_base_type] [:f.effective_type :field_effective_type]]
                    :order-by [[:t.schema :asc] [:t.name :asc] [:p.table_id :asc]
                               [:f.position :asc] [:f.id :asc] [:p.attribute :asc]])))

(mu/defn pending-proposal-keys :- [:sequential [:map
                                                [:id        ms/PositiveInt]
                                                [:table_id  ms/PositiveInt]
                                                [:field_id  ms/PositiveInt]
                                                [:attribute ::run/attribute]]]
  "The id, table, field and attribute of the pending proposals in `scope` of active fields of active tables, ordered
  by id."
  [scope :- ::scope]
  (t2/select :model/MetadataGenerationProposal
             (assoc (pending-in-scope scope)
                    :select   [:p.id :p.table_id :p.field_id :p.attribute]
                    :order-by [[:p.id :asc]])))

(mu/defn proposals-by-id :- [:sequential (ms/InstanceOf :model/MetadataGenerationProposal)]
  "The proposals with `ids`, ordered by id."
  [ids :- [:sequential ms/PositiveInt]]
  (if (seq ids)
    (t2/select :model/MetadataGenerationProposal :id [:in ids] {:order-by [[:id :asc]]})
    []))

(mu/defn lock-proposals :- [:map-of ms/PositiveInt [:map [:proposed_value [:maybe :string]] [:status ::proposal/status]]]
  "A map of proposal id to the `proposed_value` and `status` of the proposals with `ids`, with their rows locked
  until the current transaction ends."
  [ids :- [:sequential ms/PositiveInt]]
  (if (seq ids)
    (into {}
          (map (juxt :id #(select-keys % [:proposed_value :status])))
          (t2/select [:model/MetadataGenerationProposal :id :proposed_value :status]
                     {:where [:in :id ids] :for [:update]}))
    {}))

;;; Apply

(mu/defn active-fields-by-id :- [:map-of ::lib.schema.id/field (ms/InstanceOf :model/Field)]
  "A map of field id to the active Field of an active Table, with the values readers see and `:can_write` hydrated,
  for `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (if (seq field-ids)
    (into {}
          (map (juxt :id identity))
          (t2/hydrate (t2/select :model/Field
                                 {:from  [(warehouse-schema-overlay/field-query)]
                                  :where [:and
                                          [:in :id field-ids]
                                          [:= :active true]
                                          [:in :table_id ^:allow-subquery {:select [:id]
                                                                           :from   [:metabase_table]
                                                                           :where  [:= :active true]}]]})
                      :can_write))
    {}))

(mu/defn internal-dimension-ids-by-field :- [:map-of ::lib.schema.id/field [:sequential ms/PositiveInt]]
  "A map of field id to the ids of its internal Dimensions, for the ids in `field-ids` that have one."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (if (seq field-ids)
    (update-vals (group-by :field_id (t2/select [:model/Dimension :id :field_id]
                                                :field_id [:in field-ids] :type :internal))
                 #(mapv :id %))
    {}))

(mu/defn delete-dimensions!
  "Delete the Dimensions with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/delete! :model/Dimension :id [:in ids])))

(mu/defn set-proposal-status! :- :int
  "Set `status` on the proposals with `ids`, decided by `user-id` now. Returns the number of rows updated."
  [ids     :- [:sequential ms/PositiveInt]
   status  :- ::proposal/status
   user-id :- ms/PositiveInt]
  (if (seq ids)
    (t2/update! :model/MetadataGenerationProposal :id [:in ids]
                {:status status :decided_by user-id :decided_at (mi/now)})
    0))

(mu/defn delete-proposals!
  "Delete the proposals with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/delete! :model/MetadataGenerationProposal :id [:in ids])))
