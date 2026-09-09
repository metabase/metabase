(ns metabase.xrays.db
  "Application database queries for the x-rays module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.indexed-entities.schema :as indexed-entities.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn table :- [:maybe ::warehouse-schema.schema/table]
  "The Table with `table-id`, or nil. `table-id` may be nil (some callers pass a Card's or Metric's possibly-absent
  table id), in which case this returns nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables :- [:sequential ::warehouse-schema.schema/table]
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn tables-in-schema :- [:sequential ::warehouse-schema.schema/table]
  "The Tables in `schema` of the Database with `database-id`. `schema` may be nil (some drivers have no
  schema concept)."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/select :model/Table :db_id database-id :schema schema))

(mu/defn sibling-tables :- [:sequential ::warehouse-schema.schema/table]
  "The active, visible Tables in `schema` of the Database with `database-id` other than `table-id`. `schema`
  may be nil (some drivers have no schema concept)."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-id    :- ::lib.schema.id/table]
  (t2/select :model/Table
             :db_id           database-id
             :schema          schema
             :id              [:not= table-id]
             :visibility_type nil
             :active          true))

(def ^:private CandidateTableWithFieldStats
  "Rows returned by [[candidate-tables-with-field-stats]]."
  (mut/merge (mut/select-keys ::warehouse-schema.schema/table [:id :schema :display_name :entity_type :db_id])
             [:map
              [:num-fields :int]
              [:list-like? [:or :boolean :int]]]))

(mu/defn candidate-tables-with-field-stats :- [:sequential CandidateTableWithFieldStats]
  "The id, schema, name, entity type, Database, field count, and list-likeness of the active, visible Tables of the
  Database with `database-id` (optionally narrowed to `schema`) that have at least one non-key Field."
  [database-id :- ::lib.schema.id/database
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

(mu/defn field :- [:maybe ::warehouse-schema.schema/field]
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-name :- [:maybe :string]
  "The name of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :name :model/Field :id field-id))

(mu/defn metadata-column :- [:maybe ::lib.schema.metadata/column]
  "The `:metadata/column` with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :metadata/column :id field-id))

(mu/defn fields-targeting :- [:sequential ::warehouse-schema.schema/field]
  "The Fields whose FK target is the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select :model/Field :fk_target_field_id field-id))

(mu/defn fk-fields-for-tables :- [:sequential ::warehouse-schema.schema/field]
  "The FK Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field :fk_target_field_id [:not= nil] :table_id [:in table-ids]))

(mu/defn active-fk-fields-for-table :- [:sequential ::warehouse-schema.schema/field]
  "The active FK Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :fk_target_field_id [:not= nil] :active true))

(mu/defn fk-target-field-ids-for-table :- [:maybe [:set ::lib.schema.id/field]]
  "The FK target Field ids of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :fk_target_field_id :model/Field
                    :table_id           table-id
                    :fk_target_field_id [:not= nil]
                    :active             true))

(mu/defn active-field-ids-for-table :- [:maybe [:set ::lib.schema.id/field]]
  "The ids of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :id :model/Field :table_id table-id :active true))

(mu/defn table-ids-of-fields-targeting :- [:maybe [:set ::lib.schema.id/table]]
  "The Table ids of the active Fields whose FK target is one of `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select-fn-set :table_id :model/Field :fk_target_field_id [:in field-ids] :active true))

(mu/defn visible-fields-for-tables :- [:sequential ::warehouse-schema.schema/field]
  "The active, normally visible, previewable Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Field
             :table_id [:in table-ids]
             :visibility_type "normal"
             :preview_display true
             :active true))

(mu/defn other-visible-fields-in-table :- [:sequential ::warehouse-schema.schema/field]
  "The active, normally visible Fields of the Table with `table-id` other than `field-id`."
  [table-id :- [:maybe ::lib.schema.id/table]
   field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select :model/Field
             :table_id        table-id
             :id              [:not= field-id]
             :visibility_type "normal"
             :active          true))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn model-card :- [:maybe ::queries.schema/card]
  "The model Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id :type :model))

(mu/defn cards-in-collection :- [:sequential ::queries.schema/card]
  "The Cards in the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn unarchived-cards-for-table-of-types :- [:sequential ::queries.schema/card]
  "The unarchived Cards of the Table with `table-id` whose type is one of `card-types`. `table-id` may be nil
  (a native-query or nested-query Card has no resolved table id)."
  [table-id   :- [:maybe ::lib.schema.id/table]
   card-types :- [:sequential :keyword]]
  (t2/select :model/Card :table_id table-id :type [:in card-types] :archived false))

(mu/defn unarchived-metrics-for-table :- [:sequential ::queries.schema/card]
  "The unarchived metric Cards of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select :model/Card :table_id table-id :type :metric :archived false))

(mu/defn insert-card! :- ::queries.schema/card
  "Insert the Card `card` and return the inserted instance."
  [card :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn delete-cards-in-collection! :- :int
  "Delete the Cards in the Collection with `collection-id`, returning the number deleted."
  [collection-id :- ::lib.schema.id/collection]
  (t2/delete! :model/Card :collection_id collection-id))

(mu/defn segment :- [:maybe ::segments.schema/segment]
  "The Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn unarchived-segments-for-table :- [:sequential ::segments.schema/segment]
  "The unarchived Segments of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id table-id :archived false))

(mu/defn collection :- [:maybe ::collections.schema/collection]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(def ^:private CollectionLocationColumn
  "Rows returned by [[collection-location-columns]]."
  (mut/optional-keys (mut/select-keys ::collections.schema/collection [:location :id :name]) [:name]))

(mu/defn collection-location-columns :- [:maybe CollectionLocationColumn]
  "The location and id of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :location :id] :id collection-id))

(mu/defn collection-id-by-name-and-location :- [:maybe ::lib.schema.id/collection]
  "The id of the Collection named `collection-name` at `location`, or nil."
  [collection-name :- :string
   location        :- :string]
  (t2/select-one-pk :model/Collection :name collection-name :location location))

(mu/defn automagic-dashboards-collection :- [:maybe ::collections.schema/collection]
  "The unarchived automatically generated dashboards Collection at `location`, or nil."
  [location :- :string]
  (t2/select-one :model/Collection
                 :name "Automatically Generated Dashboards"
                 :archived false
                 :location location))

(mu/defn insert-collection! :- ::collections.schema/collection
  "Insert the Collection `row` and return the inserted instance."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-instance! :model/Collection row))

(mu/defn insert-collection-returning-pk! :- ::lib.schema.id/collection
  "Insert the Collection `row` and return its id."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-pk! :model/Collection row))

(mu/defn dashboards :- [:sequential ::dashboards.schema/dashboard]
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn recently-edited-dashboard-ids-for-user :- [:maybe [:set ms/PositiveInt]]
  "The ids of the Dashboards the User with `user-id` has revised, most recent first."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-fn-set :model_id :model/Revision
                    :model     "Dashboard"
                    :user_id   user-id
                    {:order-by [[:timestamp :desc]]}))

(mu/defn dashboard-ids-for-card :- [:maybe [:set ::lib.schema.id/dashboard]]
  "The Dashboard ids of the DashboardCards showing the Card with `card-id`. `card-id` may be nil (an ad-hoc
  query has no saved Card id), in which case this returns nil."
  [card-id :- [:maybe ::lib.schema.id/card]]
  (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))

(mu/defn card-ids-for-dashboard :- [:maybe [:set ::lib.schema.id/card]]
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn other-card-ids-on-dashboards :- [:maybe [:set ::lib.schema.id/card]]
  "The Card ids other than `card-id` of the DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
   card-id       :- ::lib.schema.id/card]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id [:in dashboard-ids] :card_id [:not= card-id]))

(def ^:private DashcardCardAndDashboardId
  "Rows returned by [[dashcard-card-and-dashboard-ids]]."
  [:map {:closed true}
   [:card_id      [:maybe ::lib.schema.id/card]]
   [:dashboard_id ::lib.schema.id/dashboard]])

(mu/defn dashcard-card-and-dashboard-ids :- [:sequential DashcardCardAndDashboardId]
  "The Card and Dashboard ids of the DashboardCards, optionally narrowed to `card-ids` and/or excluding
  `excluded-dashboard-ids`."
  [card-ids                :- [:maybe [:sequential ::lib.schema.id/card]]
   excluded-dashboard-ids  :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
         (concat (when (seq card-ids) [:card_id [:in card-ids]])
                 (when (seq excluded-dashboard-ids) [:dashboard_id [:not-in excluded-dashboard-ids]]))))

(mu/defn model-index :- [:maybe ::indexed-entities.schema/model-index]
  "The ModelIndex with `model-index-id`, or nil."
  [model-index-id :- ms/PositiveInt]
  (t2/select-one :model/ModelIndex model-index-id))

(mu/defn model-index-value :- [:maybe ::indexed-entities.schema/model-index-value]
  "The ModelIndexValue of the ModelIndex with `model-index-id` for the model primary key `model-pk`, or nil."
  [model-index-id :- ms/PositiveInt
   model-pk       :- :int]
  (t2/select-one :model/ModelIndexValue :model_index_id model-index-id :model_pk model-pk))
