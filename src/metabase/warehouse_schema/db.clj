(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.models.db :as models.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(def ^:private FieldUserSettingsRow
  [:map {:closed true}
   [:field_id           {:optional true} :any]
   [:created_at         {:optional true} :any]
   [:updated_at         {:optional true} :any]
   [:semantic_type      {:optional true} :any]
   [:description        {:optional true} :any]
   [:display_name       {:optional true} :any]
   [:visibility_type    {:optional true} :any]
   [:fk_target_field_id {:optional true} :any]
   [:has_field_values   {:optional true} :any]
   [:effective_type     {:optional true} :any]
   [:coercion_strategy  {:optional true} :any]
   [:caveats            {:optional true} :any]
   [:points_of_interest {:optional true} :any]
   [:nfc_path           {:optional true} :any]
   [:json_unfolding     {:optional true} :any]
   [:settings           {:optional true} :any]
   [:data_sensitivity   {:optional true} :any]])

;;; ------------------------------------------------- Field -------------------------------------------------

(mu/defn field :- [:maybe (ms/InstanceOf :model/Field)]
  "The Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-in-path :- [:maybe (ms/InstanceOf :model/Field)]
  "The Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil. See `metabase.models.db/field-in-path`, which owns the shared query."
  [table-id    :- [:maybe ms/PositiveInt]
   field-names :- [:sequential :string]]
  (models.db/field-in-path table-id field-names))

(mu/defn fields :- [:sequential (ms/InstanceOf :model/Field)]
  "The Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn fields-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Field)]
  "A map of ID to Field for `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids]))

(mu/defn field-table-id-rows :- [:sequential (ms/InstanceOf :model/Field)]
  "The ID and Table ID of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids]))

(mu/defn field-table-id :- [:maybe ms/PositiveInt]
  "The Table ID of the Field with `field-id`."
  [field-id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(mu/defn field-id-by-name :- [:maybe ms/PositiveInt]
  "The ID of the Field named `field-name` under `parent-id` in the Table with `table-id`, or nil."
  [table-id   :- ms/PositiveInt
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id))

(mu/defn field-values-eligibility :- [:maybe (ms/InstanceOf :model/Field)]
  "The columns deciding whether the Field with `field-id` should have FieldValues, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id))

(mu/defn field-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Field {:where [:= :table_id table-id]}))

(mu/defn active-field-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(defn- field-order-order-by
  [field-order]
  (case field-order
    :custom       [[:custom_position :asc]]
    :smart        [[[:case
                     (app-db/isa :semantic_type :type/PK)       0
                     (app-db/isa :semantic_type :type/Name)     1
                     (app-db/isa :semantic_type :type/Temporal) 2
                     :else                                     3]
                    :asc]
                   [:%lower.name :asc]]
    :database     [[:database_position :asc]]
    :alphabetical [[:%lower.name :asc]]))

(mu/defn field-ids-for-table-ordered :- [:sequential (ms/InstanceOf :model/Field)]
  "The ids of the Fields of the Table with `table-id`, ordered per `field-order` (`:custom`, `:smart`, `:database`,
  or `:alphabetical`)."
  [table-id    :- ms/PositiveInt
   field-order :- [:enum :custom :smart :database :alphabetical]]
  (t2/select [:model/Field :id] :table_id table-id {:order-by (field-order-order-by field-order)}))

(mu/defn active-fields-for-tables :- [:sequential (ms/InstanceOf :model/Field)]
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:order-by field-order-rule}))

(mu/defn pk-field-ids-by-table :- [:map-of ms/PositiveInt ms/PositiveInt]
  "A map of Table ID to the ID of its visible primary key Field for `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]))

(mu/defn fk-source-field-ids-without-user-settings :- [:sequential [:map {:closed true} [:id ms/PositiveInt]]]
  "The `:id` rows of the Fields targeting the Field with `field-id` that have no FieldUserSettings row."
  [field-id :- ms/PositiveInt]
  (t2/query {:select [:id]
             :from   [:metabase_field]
             :where  [:and
                      [:= :fk_target_field_id field-id]
                      [:not [:exists ^:allow-subquery {:select [1]
                                                       :from   [:metabase_field_user_settings]
                                                       :where  [:= :metabase_field_user_settings.field_id :metabase_field.id]}]]]}))

(mu/defn update-field! :- :int
  "Apply `changes` to the Field with `field-id`, returning the number updated."
  [field-id :- ms/PositiveInt
   changes  :- [:map {:closed true}
                [:position        :int]
                [:custom_position {:optional true} :int]]]
  (t2/update! :model/Field field-id changes))

(mu/defn clear-fk-targets-to-field! :- :int
  "Clear the FK semantic type and target of every Field targeting the Field with `field-id`, returning the number
  updated."
  [field-id :- ms/PositiveInt]
  (t2/update! :model/Field {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

(mu/defn delete-child-fields! :- :int
  "Delete the Fields nested under the Field with `parent-id`, returning the number deleted."
  [parent-id :- ms/PositiveInt]
  (t2/delete! :model/Field :parent_id parent-id))

(mu/defn delete-fields-for-table! :- :int
  "Delete the Fields of the Table with `table-id`, returning the number deleted."
  [table-id :- ms/PositiveInt]
  (t2/delete! :model/Field :table_id table-id))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(mu/defn field-user-settings :- [:maybe (ms/InstanceOf :model/FieldUserSettings)]
  "The FieldUserSettings of the Field with `field-id`, or nil (also for a nil `field-id`, e.g. a Field not yet
  inserted)."
  [field-id :- [:maybe ms/PositiveInt]]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(mu/defn field-user-settings-exist? :- :boolean
  "Whether the Field with `field-id` has a FieldUserSettings row."
  [field-id :- ms/PositiveInt]
  (t2/exists? :model/FieldUserSettings field-id))

(mu/defn user-edited-field-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Fields of the Table with `table-id` that have a FieldUserSettings row."
  [table-id :- ms/PositiveInt]
  (t2/select-fn-set :field_id :model/FieldUserSettings
                    {:join  [[:metabase_field :f] [:= :f.id :field_id]]
                     :where [:= :f.table_id table-id]}))

(mu/defn insert-field-user-settings! :- :int
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or FieldUserSettingsRow [:sequential FieldUserSettingsRow]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings! :- :int
  "Apply `changes` to the FieldUserSettings of the Field with `field-id`, returning the number updated."
  [field-id :- ms/PositiveInt
   changes  :- FieldUserSettingsRow]
  (t2/update! :model/FieldUserSettings field-id changes))

(mu/defn clear-user-settings-fk-targets-to-field! :- :int
  "Clear the user-set FK semantic type and target of every Field targeting the Field with `field-id`, returning the
  number updated."
  [field-id :- ms/PositiveInt]
  (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(mu/defn field-values-of-type :- [:sequential (ms/InstanceOf :model/FieldValues)]
  "The FieldValues of `type` with `hash-key` for the Field with `field-id`."
  [field-id :- ms/PositiveInt
   type     :- [:enum :full :sandbox :impersonation :linked-filter :advanced]
   hash-key :- [:maybe :string]]
  (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash-key))

(mu/defn full-field-values-for-fields :- [:sequential (ms/InstanceOf :model/FieldValues)]
  "The full FieldValues of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/FieldValues :field_id [:in field-ids] :type :full :hash_key nil))

(mu/defn full-field-values-rows :- [:sequential (ms/InstanceOf :model/FieldValues)]
  "The Field ID and values of the full FieldValues of the Field with `field-id`."
  [field-id :- ms/PositiveInt]
  (t2/select [:model/FieldValues :field_id :values] :field_id field-id :type :full))

(mu/defn full-field-values-for-tables :- [:sequential (ms/InstanceOf :model/FieldValues)]
  "The Field ID, values, and Table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/FieldValues :field_id :values :field.table_id]
             {:join  [[:metabase_field :field] [:= :metabase_fieldvalues.field_id :field.id]]
              :where [:and
                      [:in :field.table_id table-ids]
                      [:= :field.visibility_type "normal"]
                      [:= :metabase_fieldvalues.type "full"]]}))

(mu/defn full-field-values-with-human-readable-values :- [:maybe (ms/InstanceOf :model/FieldValues)]
  "The values and human-readable values of the full FieldValues of the Field with `field-id` if it has
  human-readable values, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(mu/defn field-values-last-used-at :- [:maybe ms/TemporalInstant]
  "The latest `last_used_at` of any FieldValues of the Field with `field-id`."
  [field-id :- ms/PositiveInt]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(mu/defn full-field-values-by-field :- [:sequential (ms/InstanceOf :model/FieldValues)]
  "The `columns` of the full FieldValues of the Fields with `field-ids`."
  [columns   :- [:or :keyword [:sequential :keyword]]
   field-ids :- [:seqable ms/PositiveInt]]
  (t2/select columns :field_id [:in field-ids] :type :full))

(mu/defn dimensions-for-fields :- [:sequential (ms/InstanceOf :model/Dimension)]
  "The Dimensions of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Dimension :field_id [:in field-ids]))

(mu/defn update-field-values! :- :int
  "Apply `changes` to the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt
   changes         :- [:map {:closed true}
                       [:has_more_values       {:optional true} :any]
                       [:values                {:optional true} :any]
                       [:human_readable_values {:optional true} :any]]]
  (t2/update! :model/FieldValues field-values-id changes))

(mu/defn find-or-insert-full-field-values! :- (ms/InstanceOf :model/FieldValues)
  "The full FieldValues of the Field with `field-id`, inserting one with `has-more-values`, `values`, and no
  `human_readable_values` if none exists yet."
  [field-id       :- ms/PositiveInt
   has-more-values :- :boolean
   values          :- :any]
  (app-db/select-or-insert! :model/FieldValues {:field_id field-id, :type :full}
                            (constantly {:has_more_values       has-more-values
                                         :values                values
                                         :human_readable_values nil})))

(mu/defn touch-field-values! :- :int
  "Stamp `last_used_at` on the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt]
  (t2/update! :model/FieldValues field-values-id {:last_used_at :%now}))

(mu/defn delete-field-values! :- :int
  "Delete the FieldValues with `field-values-ids`, returning the number deleted."
  [field-values-ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/FieldValues :id [:in field-values-ids]))

(mu/defn delete-field-values-for-field! :- :int
  "Delete every FieldValues of the Field with `field-id`, returning the number deleted."
  [field-id :- ms/PositiveInt]
  (t2/delete! :model/FieldValues :field_id field-id))

(mu/defn delete-field-values-of-types! :- :int
  "Delete the FieldValues of `types` of the Field with `field-id`, returning the number deleted."
  [field-id :- ms/PositiveInt
   types    :- [:seqable :keyword]]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]))

;;; ------------------------------------------------- Table -------------------------------------------------

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn table-by-name :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema))

(mu/defn table-name-and-schema :- [:maybe (ms/InstanceOf :model/Table)]
  "The name and schema of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-one [:model/Table :name :schema] :id table-id))

(mu/defn table-database-id :- [:maybe ms/PositiveInt]
  "The Database ID of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-one-fn :db_id :model/Table table-id))

(mu/defn update-table! :- :int
  "Apply `changes` to the Table with `table-id`, returning the number updated."
  [table-id :- ms/PositiveInt
   changes  :- [:map {:closed true} [:field_order :keyword]]]
  (t2/update! :model/Table table-id changes))

(mu/defn unarchived-segments-for-tables :- [:sequential (ms/InstanceOf :model/Segment)]
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn segment-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Segments of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ms/PositiveInt
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-measures-for-tables :- [:sequential (ms/InstanceOf :model/Measure)]
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn measure-ids-for-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Measures of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ms/PositiveInt
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-metric-cards-for-tables :- [:sequential (ms/InstanceOf :model/Card)]
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(mu/defn transforms-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Transform)]
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

;;; ------------------------------------------------ Database ------------------------------------------------

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn databases-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Database)]
  "A map of ID to Database for `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn database-engine :- [:maybe :keyword]
  "The engine of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn database-name :- [:maybe :string]
  "The name of the Database with `database-id`."
  [database-id :- [:maybe ms/PositiveInt]]
  (t2/select-one-fn :name :model/Database :id database-id))

(mu/defn database-id-by-name :- [:maybe ms/PositiveInt]
  "The ID of the Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-pk :model/Database :name database-name))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn collections :- [:sequential (ms/InstanceOf :model/Collection)]
  "The Collections with `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn user-summaries-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/User)]
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn cards-with-moderated-status :- [:sequential (ms/InstanceOf :model/Card)]
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids :- [:seqable ms/PositiveInt]]
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
