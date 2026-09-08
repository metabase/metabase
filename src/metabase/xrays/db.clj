(ns metabase.xrays.db
  "Application database queries for the x-rays module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CardRow
  "A whole Card row for insert."
  [:map {:closed true}
   [:name                                       {:optional true} :any]
   [:description                                {:optional true} :any]
   [:display                                    {:optional true} :any]
   [:dataset_query                              {:optional true} :any]
   [:visualization_settings                     {:optional true} :any]
   [:creator_id                                 {:optional true} :any]
   [:database_id                                {:optional true} :any]
   [:table_id                                   {:optional true} :any]
   [:query_type                                 {:optional true} :any]
   [:archived                                   {:optional true} :any]
   [:collection_id                              {:optional true} :any]
   [:public_uuid                                {:optional true} :any]
   [:made_public_by_id                          {:optional true} :any]
   [:enable_embedding                           {:optional true} :any]
   [:embedding_params                           {:optional true} :any]
   [:cache_ttl                                  {:optional true} :any]
   [:result_metadata                            {:optional true} :any]
   [:collection_position                        {:optional true} :any]
   [:entity_id                                  {:optional true} :any]
   [:parameters                                 {:optional true} :any]
   [:parameter_mappings                         {:optional true} :any]
   [:collection_preview                         {:optional true} :any]
   [:metabase_version                           {:optional true} :any]
   [:type                                       {:optional true} :any]
   [:initially_published_at                     {:optional true} :any]
   [:cache_invalidated_at                       {:optional true} :any]
   [:last_used_at                               {:optional true} :any]
   [:view_count                                 {:optional true} :any]
   [:archived_directly                          {:optional true} :any]
   [:dataset_query_metrics_v2_migration_backup  {:optional true} :any]
   [:source_card_id                             {:optional true} :any]
   [:dashboard_id                               {:optional true} :any]
   [:card_schema                                {:optional true} :any]
   [:document_id                                {:optional true} :any]
   [:legacy_query                               {:optional true} :any]
   [:embedding_type                             {:optional true} :any]
   [:public_uuid_prefix                         {:optional true} :any]
   [:dimensions                                 {:optional true} :any]
   [:dimension_mappings                         {:optional true} :any]
   [:metabot_conversation_id                    {:optional true} :any]
   [:metabot_chart_id                           {:optional true} :any]])

(def ^:private CollectionRow
  "A whole Collection row for insert."
  [:map {:closed true}
   [:name                  {:optional true} :any]
   [:description           {:optional true} :any]
   [:archived              {:optional true} :any]
   [:location              {:optional true} :any]
   [:personal_owner_id     {:optional true} :any]
   [:slug                  {:optional true} :any]
   [:namespace             {:optional true} :any]
   [:authority_level       {:optional true} :any]
   [:type                  {:optional true} :any]
   [:is_sample             {:optional true} :any]
   [:archive_operation_id  {:optional true} :any]
   [:archived_directly     {:optional true} :any]
   [:is_remote_synced      {:optional true} :any]])

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil. `table-id` may be nil (some callers pass a Card's or Metric's possibly-absent
  table id), in which case this returns nil."
  [table-id :- [:maybe ms/PositiveInt]]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn tables-in-schema :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables in `schema` of the Database with `database-id`. `schema` may be nil (some drivers have no
  schema concept)."
  [database-id :- ms/PositiveInt
   schema      :- [:maybe :string]]
  (t2/select :model/Table :db_id database-id :schema schema))

(mu/defn sibling-tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The active, visible Tables in `schema` of the Database with `database-id` other than `table-id`. `schema`
  may be nil (some drivers have no schema concept)."
  [database-id :- ms/PositiveInt
   schema      :- [:maybe :string]
   table-id    :- ms/PositiveInt]
  (t2/select :model/Table
             :db_id           database-id
             :schema          schema
             :id              [:not= table-id]
             :visibility_type nil
             :active          true))

(mu/defn candidate-tables-with-field-stats :- [:sequential (ms/InstanceOf :model/Table)]
  "The id, schema, name, entity type, Database, field count, and list-likeness of the active, visible Tables of the
  Database with `database-id` (optionally narrowed to `schema`) that have at least one non-key Field."
  [database-id :- ms/PositiveInt
   schema      :- [:maybe :string]]
  (t2/select [:model/Table :id :schema :display_name :entity_type :db_id
              [:ts.count :num-fields]
              [[:and
                [:>= :ts.count 2]
                [:= :ts.count_non_pks 1]] :list-like?]]
             {:inner-join [[^:allow-subquery {:select   [:f.table_id
                                                         [:%count.* "count"]
                                                         [[:count [:case [:or [:not= :semantic_type "type/PK"]
                                                                          [:= :f.semantic_type nil]]
                                                                   [:inline 1] :else [:inline nil]]]
                                                          :count_non_pks]
                                                         [[:count [:case [:in :f.semantic_type ["type/PK" "type/FK"]]
                                                                   [:inline 1] :else [:inline nil]]]
                                                          :count_pks_and_fks]]
                                              :from     [[:metabase_field :f]]
                                              :where    [:= :f.active true]
                                              :group-by [:f.table_id]} :ts]
                           [:and [:= :ts.table_id :id]
                            [:> :ts.count 0]
                            [:!= :ts.count :ts.count_pks_and_fks]]]
              :where (cond-> [:and
                              [:= :db_id database-id]
                              [:= :visibility_type nil]
                              [:= :active true]]
                       schema (conj [:= :schema schema]))}))

(mu/defn field :- [:maybe (ms/InstanceOf :model/Field)]
  "The Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-name :- [:maybe :string]
  "The name of the Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one-fn :name :model/Field :id field-id))

(mu/defn metadata-column :- [:maybe :map]
  "The `:metadata/column` with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one :metadata/column :id field-id))

(mu/defn fields-targeting :- [:sequential (ms/InstanceOf :model/Field)]
  "The Fields whose FK target is the Field with `field-id`."
  [field-id :- ms/PositiveInt]
  (t2/select :model/Field :fk_target_field_id field-id))

(mu/defn fk-fields-for-tables :- [:sequential (ms/InstanceOf :model/Field)]
  "The FK Fields of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Field :fk_target_field_id [:not= nil] :table_id [:in table-ids]))

(mu/defn active-fk-fields-for-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active FK Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :fk_target_field_id [:not= nil] :active true))

(mu/defn fk-target-field-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The FK target Field ids of the active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-fn-set :fk_target_field_id :model/Field
                    :table_id           table-id
                    :fk_target_field_id [:not= nil]
                    :active             true))

(mu/defn active-field-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The ids of the active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-fn-set :id :model/Field :table_id table-id :active true))

(mu/defn table-ids-of-fields-targeting :- [:maybe [:set ms/PositiveInt]]
  "The Table ids of the active Fields whose FK target is one of `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :table_id :model/Field :fk_target_field_id [:in field-ids] :active true))

(mu/defn visible-fields-for-tables :- [:sequential (ms/InstanceOf :model/Field)]
  "The active, normally visible, previewable Fields of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Field
             :table_id [:in table-ids]
             :visibility_type "normal"
             :preview_display true
             :active true))

(mu/defn other-visible-fields-in-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active, normally visible Fields of the Table with `table-id` other than `field-id`."
  [table-id :- ms/PositiveInt
   field-id :- ms/PositiveInt]
  (t2/select :model/Field
             :table_id        table-id
             :id              [:not= field-id]
             :visibility_type "normal"
             :active          true))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn model-card :- [:maybe (ms/InstanceOf :model/Card)]
  "The model Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id :type :model))

(mu/defn cards-in-collection :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards in the Collection with `collection-id`."
  [collection-id :- ms/PositiveInt]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn unarchived-cards-for-table-of-types :- [:sequential (ms/InstanceOf :model/Card)]
  "The unarchived Cards of the Table with `table-id` whose type is one of `card-types`. `table-id` may be nil
  (a native-query or nested-query Card has no resolved table id)."
  [table-id   :- [:maybe ms/PositiveInt]
   card-types :- [:seqable :keyword]]
  (t2/select :model/Card :table_id table-id :type [:in card-types] :archived false))

(mu/defn unarchived-metrics-for-table :- [:sequential (ms/InstanceOf :model/Card)]
  "The unarchived metric Cards of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ms/PositiveInt]]
  (t2/select :model/Card :table_id table-id :type :metric :archived false))

(mu/defn insert-card! :- (ms/InstanceOf :model/Card)
  "Insert the Card `card` and return the inserted instance."
  [card :- CardRow]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn delete-cards-in-collection! :- :int
  "Delete the Cards in the Collection with `collection-id`, returning the number deleted."
  [collection-id :- ms/PositiveInt]
  (t2/delete! :model/Card :collection_id collection-id))

(mu/defn segment :- [:maybe (ms/InstanceOf :model/Segment)]
  "The Segment with `segment-id`, or nil."
  [segment-id :- ms/PositiveInt]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn unarchived-segments-for-table :- [:sequential (ms/InstanceOf :model/Segment)]
  "The unarchived Segments of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ms/PositiveInt]]
  (t2/select :model/Segment :table_id table-id :archived false))

(mu/defn collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-location-columns :- [:maybe [:map {:closed true}
                                                 [:location [:maybe :string]]
                                                 [:id       ms/PositiveInt]]]
  "The location and id of the Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one [:model/Collection :location :id] :id collection-id))

(mu/defn collection-id-by-name-and-location :- [:maybe ms/PositiveInt]
  "The id of the Collection named `collection-name` at `location`, or nil."
  [collection-name :- :string
   location        :- :string]
  (t2/select-one-pk :model/Collection :name collection-name :location location))

(mu/defn automagic-dashboards-collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The unarchived automatically generated dashboards Collection at `location`, or nil."
  [location :- :string]
  (t2/select-one :model/Collection
                 :name "Automatically Generated Dashboards"
                 :archived false
                 :location location))

(mu/defn insert-collection! :- (ms/InstanceOf :model/Collection)
  "Insert the Collection `row` and return the inserted instance."
  [row :- CollectionRow]
  (t2/insert-returning-instance! :model/Collection row))

(mu/defn insert-collection-returning-pk! :- ms/PositiveInt
  "Insert the Collection `row` and return its id."
  [row :- CollectionRow]
  (t2/insert-returning-pk! :model/Collection row))

(mu/defn dashboards :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn recently-edited-dashboard-ids-for-user :- [:maybe [:set ms/PositiveInt]]
  "The ids of the Dashboards the User with `user-id` has revised, most recent first."
  [user-id :- ms/PositiveInt]
  (t2/select-fn-set :model_id :model/Revision
                    :model     "Dashboard"
                    :user_id   user-id
                    {:order-by [[:timestamp :desc]]}))

(mu/defn dashboard-ids-for-card :- [:maybe [:set ms/PositiveInt]]
  "The Dashboard ids of the DashboardCards showing the Card with `card-id`. `card-id` may be nil (an ad-hoc
  query has no saved Card id), in which case this returns nil."
  [card-id :- [:maybe ms/PositiveInt]]
  (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))

(mu/defn card-ids-for-dashboard :- [:maybe [:set ms/PositiveInt]]
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn other-card-ids-on-dashboards :- [:maybe [:set ms/PositiveInt]]
  "The Card ids other than `card-id` of the DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:seqable ms/PositiveInt]
   card-id       :- ms/PositiveInt]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id [:in dashboard-ids] :card_id [:not= card-id]))

(mu/defn dashcard-card-and-dashboard-ids :- [:sequential [:map {:closed true}
                                                          [:card_id      [:maybe ms/PositiveInt]]
                                                          [:dashboard_id ms/PositiveInt]]]
  "The Card and Dashboard ids of the DashboardCards, optionally narrowed to `card-ids` and/or excluding
  `excluded-dashboard-ids`."
  [card-ids                :- [:maybe [:seqable ms/PositiveInt]]
   excluded-dashboard-ids  :- [:maybe [:seqable ms/PositiveInt]]]
  (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
         (concat (when (seq card-ids) [:card_id [:in card-ids]])
                 (when (seq excluded-dashboard-ids) [:dashboard_id [:not-in excluded-dashboard-ids]]))))

(mu/defn model-index :- [:maybe (ms/InstanceOf :model/ModelIndex)]
  "The ModelIndex with `model-index-id`, or nil."
  [model-index-id :- ms/PositiveInt]
  (t2/select-one :model/ModelIndex model-index-id))

(mu/defn model-index-value :- [:maybe (ms/InstanceOf :model/ModelIndexValue)]
  "The ModelIndexValue of the ModelIndex with `model-index-id` for the model primary key `model-pk`, or nil."
  [model-index-id :- ms/PositiveInt
   model-pk       :- :int]
  (t2/select-one :model/ModelIndexValue :model_index_id model-index-id :model_pk model-pk))
