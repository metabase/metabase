(ns metabase.xrays.db
  "Application database queries for the x-rays module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn tables-in-schema
  "The Tables in `schema` of the Database with `database-id`."
  [database-id schema]
  (t2/select :model/Table :db_id database-id :schema schema))

(defn sibling-tables
  "The active, visible Tables in `schema` of the Database with `database-id` other than `table-id`."
  [database-id schema table-id]
  (t2/select :model/Table
             :db_id           database-id
             :schema          schema
             :id              [:not= table-id]
             :visibility_type nil
             :active          true))

(defn candidate-tables-with-field-stats
  "The id, schema, name, entity type, Database, field count, and list-likeness of the active, visible Tables of the
  Database with `database-id` (optionally narrowed to `schema`) that have at least one non-key Field."
  [database-id schema]
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

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn field-name
  "The name of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :name :model/Field :id field-id))

(defn metadata-column
  "The `:metadata/column` with `field-id`, or nil."
  [field-id]
  (t2/select-one :metadata/column :id field-id))

(defn fields-targeting
  "The Fields whose FK target is the Field with `field-id`."
  [field-id]
  (t2/select :model/Field :fk_target_field_id field-id))

(defn fk-fields-for-tables
  "The FK Fields of the Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Field :fk_target_field_id [:not= nil] :table_id [:in table-ids]))

(defn active-fk-fields-for-table
  "The active FK Fields of the Table with `table-id`."
  [table-id]
  (t2/select :model/Field :table_id table-id :fk_target_field_id [:not= nil] :active true))

(defn fk-target-field-ids-for-table
  "The FK target Field ids of the active Fields of the Table with `table-id`."
  [table-id]
  (t2/select-fn-set :fk_target_field_id :model/Field
                    :table_id           table-id
                    :fk_target_field_id [:not= nil]
                    :active             true))

(defn active-field-ids-for-table
  "The ids of the active Fields of the Table with `table-id`."
  [table-id]
  (t2/select-fn-set :id :model/Field :table_id table-id :active true))

(defn table-ids-of-fields-targeting
  "The Table ids of the active Fields whose FK target is one of `field-ids`."
  [field-ids]
  (t2/select-fn-set :table_id :model/Field :fk_target_field_id [:in field-ids] :active true))

(defn visible-fields-for-tables
  "The active, normally visible, previewable Fields of the Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Field
             :table_id [:in table-ids]
             :visibility_type "normal"
             :preview_display true
             :active true))

(defn other-visible-fields-in-table
  "The active, normally visible Fields of the Table with `table-id` other than `field-id`."
  [table-id field-id]
  (t2/select :model/Field
             :table_id        table-id
             :id              [:not= field-id]
             :visibility_type "normal"
             :active          true))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn model-card
  "The model Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id :type :model))

(defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/select :model/Card :collection_id collection-id))

(defn unarchived-cards-for-table-of-types
  "The unarchived Cards of the Table with `table-id` whose type is one of `card-types`."
  [table-id card-types]
  (t2/select :model/Card :table_id table-id :type [:in card-types] :archived false))

(defn unarchived-metrics-for-table
  "The unarchived metric Cards of the Table with `table-id`."
  [table-id]
  (t2/select :model/Card :table_id table-id :type :metric :archived false))

(defn insert-card!
  "Insert the Card `card` and return the inserted instance."
  [card]
  (t2/insert-returning-instance! :model/Card card))

(defn delete-cards-in-collection!
  "Delete the Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/delete! :model/Card :collection_id collection-id))

(defn segment
  "The Segment with `segment-id`, or nil."
  [segment-id]
  (t2/select-one :model/Segment :id segment-id))

(defn unarchived-segments-for-table
  "The unarchived Segments of the Table with `table-id`."
  [table-id]
  (t2/select :model/Segment :table_id table-id :archived false))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn collection-location-columns
  "The location and id of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :location :id] :id collection-id))

(defn collection-id-by-name-and-location
  "The id of the Collection named `collection-name` at `location`, or nil."
  [collection-name location]
  (t2/select-one-pk :model/Collection :name collection-name :location location))

(defn automagic-dashboards-collection
  "The unarchived automatically generated dashboards Collection at `location`, or nil."
  [location]
  (t2/select-one :model/Collection
                 :name "Automatically Generated Dashboards"
                 :archived false
                 :location location))

(defn insert-collection!
  "Insert the Collection `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Collection row))

(defn insert-collection-returning-pk!
  "Insert the Collection `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/Collection row))

(defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(defn recently-edited-dashboard-ids-for-user
  "The ids of the Dashboards the User with `user-id` has revised, most recent first."
  [user-id]
  (t2/select-fn-set :model_id :model/Revision
                    :model     "Dashboard"
                    :user_id   user-id
                    {:order-by [[:timestamp :desc]]}))

(defn dashboard-ids-for-card
  "The Dashboard ids of the DashboardCards showing the Card with `card-id`."
  [card-id]
  (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))

(defn card-ids-for-dashboard
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id dashboard-id))

(defn other-card-ids-on-dashboards
  "The Card ids other than `card-id` of the DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids card-id]
  (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id [:in dashboard-ids] :card_id [:not= card-id]))

(defn dashcard-card-and-dashboard-ids
  "The Card and Dashboard ids of the DashboardCards, optionally narrowed to `card-ids` and/or excluding
  `excluded-dashboard-ids`."
  [card-ids excluded-dashboard-ids]
  (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
         (concat (when (seq card-ids) [:card_id [:in card-ids]])
                 (when (seq excluded-dashboard-ids) [:dashboard_id [:not-in excluded-dashboard-ids]]))))

(defn model-index
  "The ModelIndex with `model-index-id`, or nil."
  [model-index-id]
  (t2/select-one :model/ModelIndex model-index-id))

(defn model-index-value
  "The ModelIndexValue of the ModelIndex with `model-index-id` for the model primary key `model-pk`, or nil."
  [model-index-id model-pk]
  (t2/select-one :model/ModelIndexValue :model_index_id model-index-id :model_pk model-pk))
