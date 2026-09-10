(ns metabase.xrays.db
  "Application database queries for the x-rays module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.core :as warehouse-schema]
   [toucan2.core :as t2]))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn table
  "The Table with `table-id`, or nil. `table-id` may be nil (some callers pass a Card's or Metric's possibly-absent
  table id), in which case this returns nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn tables-in-schema
  "The Tables in `schema` of the Database with `database-id`. `schema` may be nil (some drivers have no
  schema concept)."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/select :model/Table :db_id database-id :schema schema))

(mu/defn sibling-tables
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

(mu/defn candidate-tables-with-field-stats
  "The id, schema, name, entity type, Database, field count, and list-likeness of the active, visible Tables of the
  Database with `database-id` (optionally narrowed to `schema`) that have at least one non-key Field. PK/FK counts
  honor the user's `semantic_type` overrides."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (let [semantic-type (warehouse-schema/field-user-settings-column :semantic_type :f :u)]
    (t2/select [:model/Table :id :schema :display_name :entity_type :db_id
                [:ts.count :num-fields]
                [[:and
                  [:>= :ts.count 2]
                  [:= :ts.count_non_pks 1]] :list-like?]]
               {:inner-join [[^:allow-subquery {:select    [:f.table_id
                                                            [:%count.* "count"]
                                                            [[:count [:case [:or [:not= semantic-type "type/PK"]
                                                                             [:= semantic-type nil]]
                                                                      [:inline 1] :else [:inline nil]]]
                                                             :count_non_pks]
                                                            [[:count [:case [:in semantic-type ["type/PK" "type/FK"]]
                                                                      [:inline 1] :else [:inline nil]]]
                                                             :count_pks_and_fks]]
                                                :from      [[(t2/table-name :model/Field) :f]]
                                                :left-join (warehouse-schema/field-user-settings-join :f :u)
                                                :where     [:= :f.active true]
                                                :group-by  [:f.table_id]} :ts]
                             [:and [:= :ts.table_id :id]
                              [:> :ts.count 0]
                              [:!= :ts.count :ts.count_pks_and_fks]]]
                :where (cond-> [:and
                                [:= :db_id database-id]
                                [:= :visibility_type nil]
                                [:= :active true]]
                         schema (conj [:= :schema schema]))})))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-name
  "The name of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :name :model/Field :id field-id))

(mu/defn metadata-column
  "The `:metadata/column` with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :metadata/column :id field-id))

(mu/defn fields-targeting
  "The Fields whose FK target is the Field with `field-id`, as users see them; honors a user-set FK target."
  [field-id :- ::lib.schema.id/field]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:= (warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) field-id]}))

(mu/defn fk-fields-for-tables
  "The FK Fields of the Tables with `table-ids`, as users see them; honors user-set FK targets."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:and
                          [:not= (warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) nil]
                          [:in :f.table_id table-ids]]}))

(mu/defn active-fk-fields-for-table
  "The active FK Fields of the Table with `table-id`, as users see them; honors user-set FK targets."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:and
                          [:= :f.table_id table-id]
                          [:not= (warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) nil]
                          :f.active]}))

(mu/defn fk-target-field-ids-for-table
  "The FK target Field ids of the active Fields of the Table with `table-id`, honoring user-set FK targets."
  [table-id :- ::lib.schema.id/table]
  (into #{}
        (keep :fk_target_field_id)
        (t2/query {:select    [[(warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) :fk_target_field_id]]
                   :from      [[(t2/table-name :model/Field) :f]]
                   :left-join (warehouse-schema/field-user-settings-join :f :u)
                   :where     [:and
                               [:= :f.table_id table-id]
                               [:not= (warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) nil]
                               :f.active]})))

(mu/defn active-field-ids-for-table
  "The ids of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :id :model/Field :table_id table-id :active true))

(mu/defn table-ids-of-fields-targeting
  "The Table ids of the active Fields whose FK target is one of `field-ids`, honoring user-set FK targets."
  [field-ids :- [:set ::lib.schema.id/field]]
  (into #{}
        (keep :table_id)
        (t2/query {:select    [:f.table_id]
                   :from      [[(t2/table-name :model/Field) :f]]
                   :left-join (warehouse-schema/field-user-settings-join :f :u)
                   :where     [:and
                               [:in (warehouse-schema/field-user-settings-column :fk_target_field_id :f :u) field-ids]
                               :f.active]})))

(mu/defn visible-fields-for-tables
  "The active, normally visible, previewable Fields of the Tables with `table-ids`, as users see them; honors the
  user's `visibility_type`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:and
                          [:in :f.table_id table-ids]
                          [:= (warehouse-schema/field-user-settings-column :visibility_type :f :u) "normal"]
                          :f.preview_display
                          :f.active]}))

(mu/defn other-visible-fields-in-table
  "The active, normally visible Fields of the Table with `table-id` other than `field-id`, as users see them;
  honors the user's `visibility_type`."
  [table-id :- [:maybe ::lib.schema.id/table]
   field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:and
                          [:= :f.table_id table-id]
                          [:not= :f.id field-id]
                          [:= (warehouse-schema/field-user-settings-column :visibility_type :f :u) "normal"]
                          :f.active]}))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn model-card
  "The model Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id :type :model))

(mu/defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn unarchived-cards-for-table-of-types
  "The unarchived Cards of the Table with `table-id` whose type is one of `card-types`. `table-id` may be nil
  (a native-query or nested-query Card has no resolved table id)."
  [table-id   :- [:maybe ::lib.schema.id/table]
   card-types :- [:sequential :keyword]]
  (t2/select :model/Card :table_id table-id :type [:in card-types] :archived false))

(mu/defn unarchived-metrics-for-table
  "The unarchived metric Cards of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select :model/Card :table_id table-id :type :metric :archived false))

(mu/defn insert-card!
  "Insert the Card `card` and return the inserted instance."
  [card :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn delete-cards-in-collection!
  "Delete the Cards in the Collection with `collection-id`, returning the number deleted."
  [collection-id :- ::lib.schema.id/collection]
  (t2/delete! :model/Card :collection_id collection-id))

(mu/defn segment
  "The Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn unarchived-segments-for-table
  "The unarchived Segments of the Table with `table-id`. `table-id` may be nil (the caller's Table is
  itself sometimes absent)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id table-id :archived false))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-location-columns
  "The location and id of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :location :id] :id collection-id))

(mu/defn collection-id-by-name-and-location
  "The id of the Collection named `collection-name` at `location`, or nil."
  [collection-name :- :string
   location        :- :string]
  (t2/select-one-pk :model/Collection :name collection-name :location location))

(mu/defn automagic-dashboards-collection
  "The unarchived automatically generated dashboards Collection at `location`, or nil."
  [location :- :string]
  (t2/select-one :model/Collection
                 :name "Automatically Generated Dashboards"
                 :archived false
                 :location location))

(mu/defn insert-collection!
  "Insert the Collection `row` and return the inserted instance."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-instance! :model/Collection row))

(mu/defn insert-collection-returning-pk!
  "Insert the Collection `row` and return its id."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-pk! :model/Collection row))

(mu/defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn recently-edited-dashboard-ids-for-user
  "The ids of the Dashboards the User with `user-id` has revised, most recent first."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-fn-set :model_id :model/Revision
                    :model     "Dashboard"
                    :user_id   user-id
                    {:order-by [[:timestamp :desc]]}))

(mu/defn dashboard-ids-for-card
  "The Dashboard ids of the DashboardCards showing the Card with `card-id`. `card-id` may be nil (an ad-hoc
  query has no saved Card id), in which case this returns nil."
  [card-id :- [:maybe ::lib.schema.id/card]]
  (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))

(mu/defn card-ids-for-dashboard
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn other-card-ids-on-dashboards
  "The Card ids other than `card-id` of the DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
   card-id       :- ::lib.schema.id/card]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id [:in dashboard-ids] :card_id [:not= card-id]))

(mu/defn dashcard-card-and-dashboard-ids
  "The Card and Dashboard ids of the DashboardCards, optionally narrowed to `card-ids` and/or excluding
  `excluded-dashboard-ids`."
  [card-ids                :- [:maybe [:sequential ::lib.schema.id/card]]
   excluded-dashboard-ids  :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
         (concat (when (seq card-ids) [:card_id [:in card-ids]])
                 (when (seq excluded-dashboard-ids) [:dashboard_id [:not-in excluded-dashboard-ids]]))))

(mu/defn model-index
  "The ModelIndex with `model-index-id`, or nil."
  [model-index-id :- ms/PositiveInt]
  (t2/select-one :model/ModelIndex model-index-id))

(mu/defn model-index-value
  "The ModelIndexValue of the ModelIndex with `model-index-id` for the model primary key `model-pk`, or nil."
  [model-index-id :- ms/PositiveInt
   model-pk       :- :int]
  (t2/select-one :model/ModelIndexValue :model_index_id model-index-id :model_pk model-pk))
