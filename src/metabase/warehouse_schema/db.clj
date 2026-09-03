(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [metabase.app-db.core :as app-db]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

;;; ------------------------------------------------- Field -------------------------------------------------

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn field-where
  "The first Field matching the Honey SQL `query`, or nil."
  [query]
  (t2/select-one :model/Field query))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn fields-by-id
  "A map of ID to Field for `field-ids`."
  [field-ids]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids]))

(defn field-table-id-rows
  "The ID and Table ID of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids]))

(defn field-table-id
  "The Table ID of the Field with `field-id`."
  [field-id]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(defn field-id-by-name
  "The ID of the Field named `field-name` under `parent-id` in the Table with `table-id`, or nil."
  [table-id parent-id field-name]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id))

(defn field-values-eligibility
  "The columns deciding whether the Field with `field-id` should have FieldValues, or nil."
  [field-id]
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id))

(defn field-ids-for-table
  "The IDs of the Fields of the Table with `table-id`."
  [table-id]
  (t2/select-pks-set :model/Field {:where [:= :table_id table-id]}))

(defn active-field-ids-for-table
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(defn field-ids-for-table-ordered
  "The `:id` rows of the Fields of the Table with `table-id` in the Honey SQL `order-by` order."
  [table-id order-by]
  (t2/select [:model/Field :id] :table_id table-id {:order-by order-by}))

(defn active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:order-by field-order-rule}))

(defn pk-field-ids-by-table
  "A map of Table ID to the ID of its visible primary key Field for `table-ids`."
  [table-ids]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]))

(defn fk-source-field-ids-without-user-settings
  "The `:id` rows of the Fields targeting the Field with `field-id` that have no FieldUserSettings row."
  [field-id]
  (t2/query {:select [:id]
             :from   [:metabase_field]
             :where  [:and
                      [:= :fk_target_field_id field-id]
                      [:not [:exists ^:allow-subquery {:select [1]
                                                       :from   [:metabase_field_user_settings]
                                                       :where  [:= :metabase_field_user_settings.field_id :metabase_field.id]}]]]}))

(defn update-field!
  "Apply `changes` to the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/Field field-id changes))

(defn clear-fk-targets-to-field!
  "Clear the FK semantic type and target of every Field targeting the Field with `field-id`."
  [field-id]
  (t2/update! :model/Field {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

(defn delete-child-fields!
  "Delete the Fields nested under the Field with `parent-id`."
  [parent-id]
  (t2/delete! :model/Field :parent_id parent-id))

(defn delete-fields-for-table!
  "Delete the Fields of the Table with `table-id`."
  [table-id]
  (t2/delete! :model/Field :table_id table-id))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(defn field-user-settings
  "The FieldUserSettings of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(defn field-user-settings-exist?
  "Whether the Field with `field-id` has a FieldUserSettings row."
  [field-id]
  (t2/exists? :model/FieldUserSettings field-id))

(defn user-edited-field-ids-for-table
  "The IDs of the Fields of the Table with `table-id` that have a FieldUserSettings row."
  [table-id]
  (t2/select-fn-set :field_id :model/FieldUserSettings
                    {:join  [[:metabase_field :f] [:= :f.id :field_id]]
                     :where [:= :f.table_id table-id]}))

(defn insert-field-user-settings!
  "Insert one FieldUserSettings map or a sequence of them."
  [rows]
  (t2/insert! :model/FieldUserSettings rows))

(defn update-field-user-settings!
  "Apply `changes` to the FieldUserSettings of the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/FieldUserSettings field-id changes))

(defn clear-user-settings-fk-targets-to-field!
  "Clear the user-set FK semantic type and target of every Field targeting the Field with `field-id`."
  [field-id]
  (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(defn field-values-of-type
  "The FieldValues of `type` with `hash-key` for the Field with `field-id`."
  [field-id type hash-key]
  (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash-key))

(defn full-field-values-for-fields
  "The full FieldValues of the Fields with `field-ids`."
  [field-ids]
  (t2/select :model/FieldValues :field_id [:in field-ids] :type :full :hash_key nil))

(defn full-field-values-rows
  "The Field ID and values of the full FieldValues of the Field with `field-id`."
  [field-id]
  (t2/select [:model/FieldValues :field_id :values] :field_id field-id :type :full))

(defn full-field-values-for-tables
  "The Field ID, values, and Table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/FieldValues :field_id :values :field.table_id]
             {:join  [[:metabase_field :field] [:= :metabase_fieldvalues.field_id :field.id]]
              :where [:and
                      [:in :field.table_id table-ids]
                      [:= :field.visibility_type "normal"]
                      [:= :metabase_fieldvalues.type "full"]]}))

(defn full-field-values-with-human-readable-values
  "The values and human-readable values of the full FieldValues of the Field with `field-id` if it has
  human-readable values, or nil."
  [field-id]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(defn field-values-last-used-at
  "The latest `last_used_at` of any FieldValues of the Field with `field-id`."
  [field-id]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(defn full-field-values-by-field
  "The `columns` of the full FieldValues of the Fields with `field-ids`."
  [columns field-ids]
  (t2/select columns :field_id [:in field-ids] :type :full))

(defn dimensions-for-fields
  "The Dimensions of the Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Dimension :field_id [:in field-ids]))

(defn update-field-values!
  "Apply `changes` to the FieldValues with `field-values-id`."
  [field-values-id changes]
  (t2/update! :model/FieldValues field-values-id changes))

(defn touch-field-values!
  "Stamp `last_used_at` on the FieldValues with `field-values-id`."
  [field-values-id]
  (t2/update! :model/FieldValues field-values-id {:last_used_at :%now}))

(defn delete-field-values!
  "Delete the FieldValues with `field-values-ids`."
  [field-values-ids]
  (t2/delete! :model/FieldValues :id [:in field-values-ids]))

(defn delete-field-values-for-field!
  "Delete every FieldValues of the Field with `field-id`."
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id))

(defn delete-field-values-of-types!
  "Delete the FieldValues of `types` of the Field with `field-id`."
  [field-id types]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]))

;;; ------------------------------------------------- Table -------------------------------------------------

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn table-by-name
  "The Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id schema table-name]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema))

(defn table-name-and-schema
  "The name and schema of the Table with `table-id`."
  [table-id]
  (t2/select-one [:model/Table :name :schema] :id table-id))

(defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id :model/Table table-id))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn unarchived-segments-for-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(defn segment-ids-for-table
  "The IDs of the Segments of the Table with `table-id` matching the optional Honey SQL `archived-clause`."
  [table-id archived-clause]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id table-id] archived-clause]}))

(defn unarchived-measures-for-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(defn measure-ids-for-table
  "The IDs of the Measures of the Table with `table-id` matching the optional Honey SQL `archived-clause`."
  [table-id archived-clause]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id table-id] archived-clause]}))

(defn unarchived-metric-cards-for-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(defn transforms-by-id
  "A map of ID to Transform for `transform-ids`."
  [transform-ids]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

;;; ------------------------------------------------ Database ------------------------------------------------

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn databases-by-id
  "A map of ID to Database for `database-ids`."
  [database-ids]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(defn database-engine
  "The engine of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :engine :model/Database :id database-id))

(defn database-name
  "The name of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :name :model/Database :id database-id))

(defn database-id-by-name
  "The ID of the Database named `database-name`, or nil."
  [database-name]
  (t2/select-one-pk :model/Database :name database-name))

;;; ---------------------------------------------- Other models ----------------------------------------------

(defn collections
  "The Collections with `collection-ids`."
  [collection-ids]
  (t2/select :model/Collection :id [:in collection-ids]))

(defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn cards-with-moderated-status
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids]
  (t2/select :model/Card
             {:select    [:c.id :c.dataset_query :c.result_metadata :c.name
                          :c.description :c.collection_id :c.database_id :c.type
                          :c.source_card_id :c.created_at :c.entity_id :c.card_schema
                          [:r.status :moderated_status]]
              :from      [[:report_card :c]]
              :left-join [[^:allow-subquery {:select   [:moderated_item_id :status]
                                             :from     [:moderation_review]
                                             :where    [:and
                                                        [:= :moderated_item_type "card"]
                                                        [:= :most_recent true]]
                                             :order-by [[:id :desc]]
                                             :limit    1} :r]
                          [:= :r.moderated_item_id :c.id]]
              :where     [:in :c.id card-ids]}))
