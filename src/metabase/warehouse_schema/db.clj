(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.db :as models.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

;;; ------------------------------------------------- Field -------------------------------------------------

(def ^:private FieldRow
  "Rows returned by [[field]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn field :- [:maybe FieldRow]
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-in-path :- [:maybe ::lib.schema.id/field]
  "The Field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil. See `metabase.models.db/field-in-path`, which owns the shared query."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (models.db/field-in-path table-id field-names))

(def ^:private Field
  "Rows returned by [[fields]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn fields :- [:sequential Field]
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(def ^:private FieldsById
  "Rows returned by [[fields-by-id]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn fields-by-id :- [:map-of ms/PositiveInt FieldsById]
  "A map of ID to Field for `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids]))

(def ^:private FieldTableId
  "Rows returned by [[field-table-id-rows]]."
  [:map {:closed true}
   [:id       ::lib.schema.id/field]
   [:table_id ::lib.schema.id/table]])

(mu/defn field-table-id-rows :- [:sequential FieldTableId]
  "The ID and Table ID of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids]))

(mu/defn field-table-id :- [:maybe ::lib.schema.id/table]
  "The Table ID of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(def ^:private FieldIdByName
  "Rows returned by [[field-id-by-name]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn field-id-by-name :- [:maybe FieldIdByName]
  "The ID of the Field named `field-name` under `parent-id` in the Table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id))

(def ^:private FieldValuesEligibility
  "Rows returned by [[field-values-eligibility]]."
  [:map {:closed true}
   [:base_type        [:or :keyword :string :map sequential?]]
   [:visibility_type  [:or :keyword :string]]
   [:has_field_values [:maybe [:or :keyword :string :map sequential?]]]
   [:preview_display  :boolean]])

(mu/defn field-values-eligibility :- [:maybe FieldValuesEligibility]
  "The columns deciding whether the Field with `field-id` should have FieldValues, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id))

(def ^:private FieldIdsForTable
  "Rows returned by [[field-ids-for-table]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn field-ids-for-table :- [:maybe [:set FieldIdsForTable]]
  "The IDs of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field {:where [:= :table_id table-id]}))

(def ^:private ActiveFieldIdsForTable
  "Rows returned by [[active-field-ids-for-table]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn active-field-ids-for-table :- [:maybe [:set ActiveFieldIdsForTable]]
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
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

(def ^:private FieldIdsForTableOrdered
  "Rows returned by [[field-ids-for-table-ordered]]."
  [:map {:closed true}
   [:id ::lib.schema.id/field]])

(mu/defn field-ids-for-table-ordered :- [:sequential FieldIdsForTableOrdered]
  "The ids of the Fields of the Table with `table-id`, ordered per `field-order` (`:custom`, `:smart`, `:database`,
  or `:alphabetical`)."
  [table-id    :- ::lib.schema.id/table
   field-order :- [:enum :custom :smart :database :alphabetical]]
  (t2/select [:model/Field :id] :table_id table-id {:order-by (field-order-order-by field-order)}))

(def ^:private ActiveFieldsForTable
  "Rows returned by [[active-fields-for-tables]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn active-fields-for-tables :- [:sequential ActiveFieldsForTable]
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:order-by field-order-rule}))

(mu/defn pk-field-ids-by-table :- [:map-of ms/PositiveInt ms/PositiveInt]
  "A map of Table ID to the ID of its visible primary key Field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]))

(mu/defn fk-source-field-ids-without-user-settings :- [:sequential [:map {:closed true} [:id ms/PositiveInt]]]
  "The `:id` rows of the Fields targeting the Field with `field-id` that have no FieldUserSettings row."
  [field-id :- ::lib.schema.id/field]
  (t2/query {:select [:id]
             :from   [:metabase_field]
             :where  [:and
                      [:= :fk_target_field_id field-id]
                      [:not [:exists ^:allow-subquery {:select [1]
                                                       :from   [:metabase_field_user_settings]
                                                       :where  [:= :metabase_field_user_settings.field_id :metabase_field.id]}]]]}))

(mu/defn update-field! :- :int
  "Apply `changes` to the Field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field.update [:position :custom_position])]
  (t2/update! :model/Field field-id changes))

(mu/defn clear-fk-targets-to-field! :- :int
  "Clear the FK semantic type and target of every Field targeting the Field with `field-id`, returning the number
  updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/Field {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

(mu/defn delete-child-fields! :- :int
  "Delete the Fields nested under the Field with `parent-id`, returning the number deleted."
  [parent-id :- ms/PositiveInt]
  (t2/delete! :model/Field :parent_id parent-id))

(mu/defn delete-fields-for-table! :- :int
  "Delete the Fields of the Table with `table-id`, returning the number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/Field :table_id table-id))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(def ^:private FieldUserSetting
  "Rows returned by [[field-user-settings]]."
  [:map {:closed true}
   [:field_id           ::lib.schema.id/field]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:semantic_type      [:maybe [:or :keyword :string :map sequential?]]]
   [:description        [:maybe [:or :string :map sequential?]]]
   [:display_name       [:maybe :string]]
   [:visibility_type    [:maybe [:or :keyword :string]]]
   [:fk_target_field_id [:maybe ::lib.schema.id/field]]
   [:has_field_values   [:maybe [:or :keyword :string :map sequential?]]]
   [:effective_type     [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy  [:maybe [:or :keyword :string :map sequential?]]]
   [:caveats            [:maybe [:or :string :map sequential?]]]
   [:points_of_interest [:maybe [:or :string :map sequential?]]]
   [:nfc_path           [:maybe [:or :string :map sequential?]]]
   [:json_unfolding     [:maybe :boolean]]
   [:settings           [:maybe [:or :string :map sequential?]]]
   [:data_sensitivity   [:maybe [:or :keyword :string]]]])

(mu/defn field-user-settings :- [:maybe FieldUserSetting]
  "The FieldUserSettings of the Field with `field-id`, or nil (also for a nil `field-id`, e.g. a Field not yet
  inserted)."
  [field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(mu/defn field-user-settings-exist? :- :boolean
  "Whether the Field with `field-id` has a FieldUserSettings row."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldUserSettings field-id))

(def ^:private UserEditedFieldIdsForTable
  "Rows returned by [[user-edited-field-ids-for-table]]."
  [:map {:closed true}
   [:id                         ::lib.schema.id/field]
   [:created_at                 ms/TemporalInstant]
   [:updated_at                 ms/TemporalInstant]
   [:name                       :string]
   [:base_type                  [:or :keyword :string :map sequential?]]
   [:semantic_type              [:maybe [:or :keyword :string :map sequential?]]]
   [:active                     :boolean]
   [:description                [:maybe [:or :string :map sequential?]]]
   [:preview_display            :boolean]
   [:position                   :int]
   [:table_id                   ::lib.schema.id/table]
   [:parent_id                  [:maybe ms/PositiveInt]]
   [:display_name               [:maybe :string]]
   [:visibility_type            [:or :keyword :string]]
   [:fk_target_field_id         [:maybe ::lib.schema.id/field]]
   [:last_analyzed              [:maybe ms/TemporalInstant]]
   [:points_of_interest         [:maybe [:or :string :map sequential?]]]
   [:caveats                    [:maybe [:or :string :map sequential?]]]
   [:fingerprint                [:maybe [:or :string :map sequential?]]]
   [:fingerprint_version        :int]
   [:database_type              [:or :keyword :string :map sequential?]]
   [:has_field_values           [:maybe [:or :keyword :string :map sequential?]]]
   [:settings                   [:maybe [:or :string :map sequential?]]]
   [:database_position          :int]
   [:custom_position            :int]
   [:effective_type             [:maybe [:or :keyword :string :map sequential?]]]
   [:coercion_strategy          [:maybe [:or :keyword :string :map sequential?]]]
   [:nfc_path                   [:maybe [:or :string :map sequential?]]]
   [:database_required          :boolean]
   [:json_unfolding             :boolean]
   [:database_is_auto_increment :boolean]
   [:database_indexed           [:maybe :boolean]]
   [:database_partitioned       [:maybe :boolean]]
   [:is_defective_duplicate     :boolean]
   [:unique_field_helper        [:maybe :int]]
   [:database_is_pk             [:maybe :boolean]]
   [:database_is_nullable       [:maybe :boolean]]
   [:database_is_generated      [:maybe :boolean]]
   [:database_default           [:maybe [:or :string :map sequential?]]]
   [:dimension_interestingness  [:maybe number?]]
   [:data_sensitivity           [:maybe [:or :keyword :string]]]])

(mu/defn user-edited-field-ids-for-table :- [:maybe [:set (mut/optional-keys (mut/open-schema UserEditedFieldIdsForTable))]]
  "The IDs of the Fields of the Table with `table-id` that have a FieldUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :field_id :model/FieldUserSettings
                    {:join  [[:metabase_field :f] [:= :f.id :field_id]]
                     :where [:= :f.table_id table-id]}))

(mu/defn insert-field-user-settings! :- :int
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or (mut/select-keys ::warehouse-schema.schema/field-user-settings.update [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity]) [:sequential (mut/select-keys ::warehouse-schema.schema/field-user-settings.update [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity])]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings! :- :int
  "Apply `changes` to the FieldUserSettings of the Field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field-user-settings.update [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity])]
  (t2/update! :model/FieldUserSettings field-id changes))

(mu/defn clear-user-settings-fk-targets-to-field! :- :int
  "Clear the user-set FK semantic type and target of every Field targeting the Field with `field-id`, returning the
  number updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(def ^:private FieldValuesOfType
  "Rows returned by [[field-values-of-type]]."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:values                [:maybe [:or :string :map sequential?]]]
   [:human_readable_values [:maybe [:or :string :map sequential?]]]
   [:field_id              ::lib.schema.id/field]
   [:has_more_values       [:maybe :boolean]]
   [:type                  [:or :keyword :string]]
   [:hash_key              [:maybe [:or :string :map sequential?]]]
   [:last_used_at          ms/TemporalInstant]])

(mu/defn field-values-of-type :- [:sequential FieldValuesOfType]
  "The FieldValues of `type` with `hash-key` for the Field with `field-id`."
  [field-id :- ::lib.schema.id/field
   type     :- [:enum :full :sandbox :impersonation :linked-filter :advanced]
   hash-key :- [:maybe :string]]
  (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash-key))

(def ^:private FullFieldValuesForField
  "Rows returned by [[full-field-values-for-fields]]."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:values                [:maybe [:or :string :map sequential?]]]
   [:human_readable_values [:maybe [:or :string :map sequential?]]]
   [:field_id              ::lib.schema.id/field]
   [:has_more_values       [:maybe :boolean]]
   [:type                  [:or :keyword :string]]
   [:hash_key              [:maybe [:or :string :map sequential?]]]
   [:last_used_at          ms/TemporalInstant]])

(mu/defn full-field-values-for-fields :- [:sequential FullFieldValuesForField]
  "The full FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/FieldValues :field_id [:in field-ids] :type :full :hash_key nil))

(def ^:private FullFieldValue
  "Rows returned by [[full-field-values-rows]]."
  [:map {:closed true}
   [:field_id ::lib.schema.id/field]
   [:values   [:maybe [:or :string :map sequential?]]]])

(mu/defn full-field-values-rows :- [:sequential FullFieldValue]
  "The Field ID and values of the full FieldValues of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select [:model/FieldValues :field_id :values] :field_id field-id :type :full))

(def ^:private FullFieldValuesForTable
  "Rows returned by [[full-field-values-for-tables]]."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:values                [:maybe [:or :string :map sequential?]]]
   [:human_readable_values [:maybe [:or :string :map sequential?]]]
   [:field_id              ::lib.schema.id/field]
   [:has_more_values       [:maybe :boolean]]
   [:type                  [:or :keyword :string]]
   [:hash_key              [:maybe [:or :string :map sequential?]]]
   [:last_used_at          ms/TemporalInstant]])

(mu/defn full-field-values-for-tables :- [:sequential (mut/optional-keys (mut/open-schema FullFieldValuesForTable))]
  "The Field ID, values, and Table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/FieldValues :field_id :values :field.table_id]
             {:join  [[:metabase_field :field] [:= :metabase_fieldvalues.field_id :field.id]]
              :where [:and
                      [:in :field.table_id table-ids]
                      [:= :field.visibility_type "normal"]
                      [:= :metabase_fieldvalues.type "full"]]}))

(def ^:private FullFieldValuesWithHumanReadableValue
  "Rows returned by [[full-field-values-with-human-readable-values]]."
  [:map {:closed true}
   [:values                [:maybe [:or :string :map sequential?]]]
   [:human_readable_values [:maybe [:or :string :map sequential?]]]])

(mu/defn full-field-values-with-human-readable-values :- [:maybe FullFieldValuesWithHumanReadableValue]
  "The values and human-readable values of the full FieldValues of the Field with `field-id` if it has
  human-readable values, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(mu/defn field-values-last-used-at :- [:maybe ms/TemporalInstant]
  "The latest `last_used_at` of any FieldValues of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(mu/defn full-field-values-by-field :- [:sequential ::warehouse-schema.schema/field-values]
  "The `columns` of the full FieldValues of the Fields with `field-ids`."
  [columns   :- [:or :keyword [:sequential :keyword]]
   field-ids :- [:set ::lib.schema.id/field]]
  (t2/select columns :field_id [:in field-ids] :type :full))

(def ^:private DimensionsForField
  "Rows returned by [[dimensions-for-fields]]."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:field_id                ::lib.schema.id/field]
   [:name                    :string]
   [:type                    [:or :keyword :string]]
   [:human_readable_field_id [:maybe ::lib.schema.id/field]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:entity_id               :string]])

(mu/defn dimensions-for-fields :- [:sequential DimensionsForField]
  "The Dimensions of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Dimension :field_id [:in field-ids]))

(mu/defn update-field-values! :- :int
  "Apply `changes` to the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt
   changes         :- (mut/select-keys ::warehouse-schema.schema/field-values.update [:has_more_values :values :human_readable_values])]
  (t2/update! :model/FieldValues field-values-id changes))

(mu/defn find-or-insert-full-field-values! :- (mut/optional-keys [:map {:closed true}
                                                                  [:id                    ms/PositiveInt]
                                                                  [:created_at            ms/TemporalInstant]
                                                                  [:updated_at            ms/TemporalInstant]
                                                                  [:values                [:maybe [:or :string :map sequential?]]]
                                                                  [:human_readable_values [:maybe [:or :string :map sequential?]]]
                                                                  [:field_id              ::lib.schema.id/field]
                                                                  [:has_more_values       [:maybe :boolean]]
                                                                  [:type                  [:or :keyword :string]]
                                                                  [:hash_key              [:maybe [:or :string :map sequential?]]]
                                                                  [:last_used_at          ms/TemporalInstant]])
  "The full FieldValues of the Field with `field-id`, inserting one with `has-more-values`, `values`, and no
  `human_readable_values` if none exists yet."
  [field-id       :- ::lib.schema.id/field
   has-more-values :- :boolean
   values          :- [:maybe [:sequential [:maybe [:or :string number? :boolean]]]]]
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
  [field-values-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/FieldValues :id [:in field-values-ids]))

(mu/defn delete-field-values-for-field! :- :int
  "Delete every FieldValues of the Field with `field-id`, returning the number deleted."
  [field-id :- ::lib.schema.id/field]
  (t2/delete! :model/FieldValues :field_id field-id))

(mu/defn delete-field-values-of-types! :- :int
  "Delete the FieldValues of `types` of the Field with `field-id`, returning the number deleted."
  [field-id :- ::lib.schema.id/field
   types    :- [:set :keyword]]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]))

;;; ------------------------------------------------- Table -------------------------------------------------

(def ^:private TableRow
  "Rows returned by [[table]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  :boolean]
   [:unique_table_helper     [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string :map sequential?]]
   [:data_source             [:maybe [:or :keyword :string :map sequential?]]]
   [:data_layer              [:maybe [:or :keyword :string :map sequential?]]]
   [:owner_email             [:maybe [:or :string :map sequential?]]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

(mu/defn table :- [:maybe TableRow]
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(def ^:private Table
  "Rows returned by [[tables]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  :boolean]
   [:unique_table_helper     [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string :map sequential?]]
   [:data_source             [:maybe [:or :keyword :string :map sequential?]]]
   [:data_layer              [:maybe [:or :keyword :string :map sequential?]]]
   [:owner_email             [:maybe [:or :string :map sequential?]]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

(mu/defn tables :- [:sequential Table]
  "The Tables with `table-ids`."
  [table-ids :- [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
  (t2/select :model/Table :id [:in table-ids]))

(def ^:private TableByName
  "Rows returned by [[table-by-name]]."
  [:map {:closed true}
   [:id                      ::lib.schema.id/table]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:entity_type             [:maybe [:or :keyword :string]]]
   [:active                  :boolean]
   [:db_id                   ::lib.schema.id/database]
   [:display_name            [:maybe :string]]
   [:visibility_type         [:maybe [:or :keyword :string]]]
   [:schema                  [:maybe :string]]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:field_order             [:or :keyword :string]]
   [:initial_sync_status     [:or :keyword :string]]
   [:is_upload               :boolean]
   [:database_require_filter [:maybe :boolean]]
   [:estimated_row_count     [:maybe :int]]
   [:view_count              :int]
   [:is_defective_duplicate  :boolean]
   [:unique_table_helper     [:maybe :string]]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:archived_at             [:maybe ms/TemporalInstant]]
   [:is_writable             [:maybe :boolean]]
   [:data_authority          [:or :keyword :string :map sequential?]]
   [:data_source             [:maybe [:or :keyword :string :map sequential?]]]
   [:data_layer              [:maybe [:or :keyword :string :map sequential?]]]
   [:owner_email             [:maybe [:or :string :map sequential?]]]
   [:owner_user_id           [:maybe ::lib.schema.id/user]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:is_published            :boolean]
   [:transform_id            [:maybe ::lib.schema.id/transform]]
   [:transform_target        :boolean]])

(mu/defn table-by-name :- [:maybe TableByName]
  "The Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema))

(def ^:private TableNameAndSchema
  "Rows returned by [[table-name-and-schema]]."
  [:map {:closed true}
   [:name   :string]
   [:schema [:maybe :string]]])

(mu/defn table-name-and-schema :- [:maybe TableNameAndSchema]
  "The name and schema of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :name :schema] :id table-id))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table table-id))

(mu/defn update-table! :- :int
  "Apply `changes` to the Table with `table-id`, returning the number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table.update [:field_order])]
  (t2/update! :model/Table table-id changes))

(def ^:private UnarchivedSegmentsForTable
  "Rows returned by [[unarchived-segments-for-tables]]."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:table_id                ::lib.schema.id/table]
   [:creator_id              ::lib.schema.id/user]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:archived                :boolean]
   [:definition              [:or :string :map sequential?]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:entity_id               :string]])

(mu/defn unarchived-segments-for-tables :- [:sequential UnarchivedSegmentsForTable]
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(def ^:private SegmentIdsForTable
  "Rows returned by [[segment-ids-for-table]]."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:table_id                ::lib.schema.id/table]
   [:creator_id              ::lib.schema.id/user]
   [:name                    :string]
   [:description             [:maybe [:or :string :map sequential?]]]
   [:archived                :boolean]
   [:definition              [:or :string :map sequential?]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:points_of_interest      [:maybe [:or :string :map sequential?]]]
   [:caveats                 [:maybe [:or :string :map sequential?]]]
   [:show_in_getting_started :boolean]
   [:entity_id               :string]])

(mu/defn segment-ids-for-table :- [:maybe [:set SegmentIdsForTable]]
  "The IDs of the Segments of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(def ^:private UnarchivedMeasuresForTable
  "Rows returned by [[unarchived-measures-for-tables]]."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:table_id           ::lib.schema.id/table]
   [:creator_id         ::lib.schema.id/user]
   [:name               :string]
   [:description        [:maybe [:or :string :map sequential?]]]
   [:archived           :boolean]
   [:definition         [:or :string :map sequential?]]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:entity_id          :string]
   [:dimensions         [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings [:maybe [:or :string :map sequential?]]]])

(mu/defn unarchived-measures-for-tables :- [:sequential UnarchivedMeasuresForTable]
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(def ^:private MeasureIdsForTable
  "Rows returned by [[measure-ids-for-table]]."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:table_id           ::lib.schema.id/table]
   [:creator_id         ::lib.schema.id/user]
   [:name               :string]
   [:description        [:maybe [:or :string :map sequential?]]]
   [:archived           :boolean]
   [:definition         [:or :string :map sequential?]]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:entity_id          :string]
   [:dimensions         [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings [:maybe [:or :string :map sequential?]]]])

(mu/defn measure-ids-for-table :- [:maybe [:set MeasureIdsForTable]]
  "The IDs of the Measures of the Table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(def ^:private UnarchivedMetricCardsForTable
  "Rows returned by [[unarchived-metric-cards-for-tables]]."
  [:map {:closed true}
   [:id                                        ::lib.schema.id/card]
   [:created_at                                ms/TemporalInstant]
   [:updated_at                                ms/TemporalInstant]
   [:name                                      :string]
   [:description                               [:maybe [:or :string :map sequential?]]]
   [:display                                   [:or :keyword :string]]
   [:dataset_query                             [:or :string :map sequential?]]
   [:visualization_settings                    [:or :string :map sequential?]]
   [:creator_id                                ::lib.schema.id/user]
   [:database_id                               ::lib.schema.id/database]
   [:table_id                                  [:maybe ::lib.schema.id/table]]
   [:query_type                                [:maybe [:or :keyword :string]]]
   [:archived                                  :boolean]
   [:collection_id                             [:maybe ::lib.schema.id/collection]]
   [:public_uuid                               [:maybe [:or :string uuid?]]]
   [:made_public_by_id                         [:maybe ms/PositiveInt]]
   [:enable_embedding                          :boolean]
   [:embedding_params                          [:maybe [:or :string :map sequential?]]]
   [:cache_ttl                                 [:maybe :int]]
   [:result_metadata                           [:maybe [:or :string :map sequential?]]]
   [:collection_position                       [:maybe :int]]
   [:entity_id                                 :string]
   [:parameters                                [:maybe [:or :string :map sequential?]]]
   [:parameter_mappings                        [:maybe [:or :string :map sequential?]]]
   [:collection_preview                        :boolean]
   [:metabase_version                          [:maybe :string]]
   [:type                                      [:or :keyword :string]]
   [:initially_published_at                    [:maybe ms/TemporalInstant]]
   [:cache_invalidated_at                      [:maybe ms/TemporalInstant]]
   [:last_used_at                              ms/TemporalInstant]
   [:view_count                                :int]
   [:archived_directly                         :boolean]
   [:dataset_query_metrics_v2_migration_backup [:maybe [:or :string :map sequential?]]]
   [:source_card_id                            [:maybe ::lib.schema.id/card]]
   [:dashboard_id                              [:maybe ::lib.schema.id/dashboard]]
   [:card_schema                               :int]
   [:document_id                               [:maybe ms/PositiveInt]]
   [:legacy_query                              [:maybe [:or :string :map sequential?]]]
   [:embedding_type                            [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix                        [:maybe :string]]
   [:dimensions                                [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings                        [:maybe [:or :string :map sequential?]]]
   [:metabot_conversation_id                   [:maybe :string]]
   [:metabot_chart_id                          [:maybe :string]]])

(mu/defn unarchived-metric-cards-for-tables :- [:sequential UnarchivedMetricCardsForTable]
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(def ^:private TransformsById
  "Rows returned by [[transforms-by-id]]."
  [:map {:closed true}
   [:id                    ::lib.schema.id/transform]
   [:name                  [:or :string :map sequential?]]
   [:description           [:maybe [:or :string :map sequential?]]]
   [:source                [:or :keyword :string :map sequential?]]
   [:target                [:or :string :map sequential?]]
   [:entity_id             :string]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:source_type           [:or :keyword :string]]
   [:creator_id            ::lib.schema.id/user]
   [:source_database_id    [:maybe ::lib.schema.id/database]]
   [:collection_id         [:maybe ::lib.schema.id/collection]]
   [:owner_user_id         [:maybe ::lib.schema.id/user]]
   [:owner_email           [:maybe [:or :string :map sequential?]]]
   [:target_db_id          [:maybe ::lib.schema.id/database]]
   [:last_checkpoint_value [:maybe [:or :string :map sequential?]]]
   [:target_table_id       [:maybe ::lib.schema.id/table]]
   [:table_dependencies    [:maybe [:or :string :map sequential?]]]])

(mu/defn transforms-by-id :- [:map-of ms/PositiveInt TransformsById]
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

;;; ------------------------------------------------ Database ------------------------------------------------

(def ^:private Database
  "Rows returned by [[database]]."
  [:map {:closed true}
   [:id                          ::lib.schema.id/database]
   [:created_at                  ms/TemporalInstant]
   [:updated_at                  ms/TemporalInstant]
   [:name                        :string]
   [:description                 [:maybe [:or :string :map sequential?]]]
   [:details                     [:or :string :map sequential?]]
   [:engine                      [:or :keyword :string]]
   [:is_sample                   :boolean]
   [:is_full_sync                :boolean]
   [:points_of_interest          [:maybe [:or :string :map sequential?]]]
   [:caveats                     [:maybe [:or :string :map sequential?]]]
   [:metadata_sync_schedule      :string]
   [:cache_field_values_schedule [:maybe :string]]
   [:timezone                    [:maybe :string]]
   [:is_on_demand                :boolean]
   [:auto_run_queries            :boolean]
   [:refingerprint               [:maybe :boolean]]
   [:cache_ttl                   [:maybe :int]]
   [:initial_sync_status         [:or :keyword :string]]
   [:creator_id                  [:maybe ::lib.schema.id/user]]
   [:settings                    [:maybe [:or :string :map sequential?]]]
   [:dbms_version                [:maybe [:or :string :map sequential?]]]
   [:is_audit                    :boolean]
   [:uploads_enabled             :boolean]
   [:uploads_schema_name         [:maybe [:or :string :map sequential?]]]
   [:uploads_table_prefix        [:maybe [:or :string :map sequential?]]]
   [:is_attached_dwh             :boolean]
   [:router_database_id          [:maybe ::lib.schema.id/database]]
   [:provider_name               [:maybe :string]]
   [:write_data_details          [:maybe [:or :string :map sequential?]]]
   [:admin_details               [:maybe [:or :string :map sequential?]]]
   [:is_stub                     :boolean]
   [:features                    [:maybe [:set :keyword]]]])

(mu/defn database :- [:maybe Database]
  "The Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(def ^:private DatabasesById
  "Rows returned by [[databases-by-id]]."
  [:map {:closed true}
   [:id                          ::lib.schema.id/database]
   [:created_at                  ms/TemporalInstant]
   [:updated_at                  ms/TemporalInstant]
   [:name                        :string]
   [:description                 [:maybe [:or :string :map sequential?]]]
   [:details                     [:or :string :map sequential?]]
   [:engine                      [:or :keyword :string]]
   [:is_sample                   :boolean]
   [:is_full_sync                :boolean]
   [:points_of_interest          [:maybe [:or :string :map sequential?]]]
   [:caveats                     [:maybe [:or :string :map sequential?]]]
   [:metadata_sync_schedule      :string]
   [:cache_field_values_schedule [:maybe :string]]
   [:timezone                    [:maybe :string]]
   [:is_on_demand                :boolean]
   [:auto_run_queries            :boolean]
   [:refingerprint               [:maybe :boolean]]
   [:cache_ttl                   [:maybe :int]]
   [:initial_sync_status         [:or :keyword :string]]
   [:creator_id                  [:maybe ::lib.schema.id/user]]
   [:settings                    [:maybe [:or :string :map sequential?]]]
   [:dbms_version                [:maybe [:or :string :map sequential?]]]
   [:is_audit                    :boolean]
   [:uploads_enabled             :boolean]
   [:uploads_schema_name         [:maybe [:or :string :map sequential?]]]
   [:uploads_table_prefix        [:maybe [:or :string :map sequential?]]]
   [:is_attached_dwh             :boolean]
   [:router_database_id          [:maybe ::lib.schema.id/database]]
   [:provider_name               [:maybe :string]]
   [:write_data_details          [:maybe [:or :string :map sequential?]]]
   [:admin_details               [:maybe [:or :string :map sequential?]]]
   [:is_stub                     :boolean]
   [:features                    [:maybe [:set :keyword]]]])

(mu/defn databases-by-id :- [:map-of DatabasesById [:map {:closed true}
                                                    [:id                          ::lib.schema.id/database]
                                                    [:created_at                  ms/TemporalInstant]
                                                    [:updated_at                  ms/TemporalInstant]
                                                    [:name                        :string]
                                                    [:description                 [:maybe [:or :string :map sequential?]]]
                                                    [:details                     [:or :string :map sequential?]]
                                                    [:engine                      [:or :keyword :string]]
                                                    [:is_sample                   :boolean]
                                                    [:is_full_sync                :boolean]
                                                    [:points_of_interest          [:maybe [:or :string :map sequential?]]]
                                                    [:caveats                     [:maybe [:or :string :map sequential?]]]
                                                    [:metadata_sync_schedule      :string]
                                                    [:cache_field_values_schedule [:maybe :string]]
                                                    [:timezone                    [:maybe :string]]
                                                    [:is_on_demand                :boolean]
                                                    [:auto_run_queries            :boolean]
                                                    [:refingerprint               [:maybe :boolean]]
                                                    [:cache_ttl                   [:maybe :int]]
                                                    [:initial_sync_status         [:or :keyword :string]]
                                                    [:creator_id                  [:maybe ::lib.schema.id/user]]
                                                    [:settings                    [:maybe [:or :string :map sequential?]]]
                                                    [:dbms_version                [:maybe [:or :string :map sequential?]]]
                                                    [:is_audit                    :boolean]
                                                    [:uploads_enabled             :boolean]
                                                    [:uploads_schema_name         [:maybe [:or :string :map sequential?]]]
                                                    [:uploads_table_prefix        [:maybe [:or :string :map sequential?]]]
                                                    [:is_attached_dwh             :boolean]
                                                    [:router_database_id          [:maybe ::lib.schema.id/database]]
                                                    [:provider_name               [:maybe :string]]
                                                    [:write_data_details          [:maybe [:or :string :map sequential?]]]
                                                    [:admin_details               [:maybe [:or :string :map sequential?]]]
                                                    [:is_stub                     :boolean]
                                                    [:features                    [:maybe [:set :keyword]]]]]
  "A map of ID to Database for `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn database-engine :- [:maybe :keyword]
  "The engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn database-name :- [:maybe :string]
  "The name of the Database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name :model/Database :id database-id))

(def ^:private DatabaseIdByName
  "Rows returned by [[database-id-by-name]]."
  [:map {:closed true}
   [:id                          ::lib.schema.id/database]
   [:created_at                  ms/TemporalInstant]
   [:updated_at                  ms/TemporalInstant]
   [:name                        :string]
   [:description                 [:maybe [:or :string :map sequential?]]]
   [:details                     [:or :string :map sequential?]]
   [:engine                      [:or :keyword :string]]
   [:is_sample                   :boolean]
   [:is_full_sync                :boolean]
   [:points_of_interest          [:maybe [:or :string :map sequential?]]]
   [:caveats                     [:maybe [:or :string :map sequential?]]]
   [:metadata_sync_schedule      :string]
   [:cache_field_values_schedule [:maybe :string]]
   [:timezone                    [:maybe :string]]
   [:is_on_demand                :boolean]
   [:auto_run_queries            :boolean]
   [:refingerprint               [:maybe :boolean]]
   [:cache_ttl                   [:maybe :int]]
   [:initial_sync_status         [:or :keyword :string]]
   [:creator_id                  [:maybe ::lib.schema.id/user]]
   [:settings                    [:maybe [:or :string :map sequential?]]]
   [:dbms_version                [:maybe [:or :string :map sequential?]]]
   [:is_audit                    :boolean]
   [:uploads_enabled             :boolean]
   [:uploads_schema_name         [:maybe [:or :string :map sequential?]]]
   [:uploads_table_prefix        [:maybe [:or :string :map sequential?]]]
   [:is_attached_dwh             :boolean]
   [:router_database_id          [:maybe ::lib.schema.id/database]]
   [:provider_name               [:maybe :string]]
   [:write_data_details          [:maybe [:or :string :map sequential?]]]
   [:admin_details               [:maybe [:or :string :map sequential?]]]
   [:is_stub                     :boolean]
   [:features                    [:maybe [:set :keyword]]]])

(mu/defn database-id-by-name :- [:maybe DatabaseIdByName]
  "The ID of the Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-pk :model/Database :name database-name))

;;; ---------------------------------------------- Other models ----------------------------------------------

(def ^:private Collection
  "Rows returned by [[collections]]."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 [:or :string :map sequential?]]
   [:description          [:maybe [:or :string :map sequential?]]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mu/defn collections :- [:sequential Collection]
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(def ^:private UserSummariesById
  "Rows returned by [[user-summaries-by-id]]."
  [:map {:closed true}
   [:id              ::lib.schema.id/user]
   [:email           :string]
   [:date_joined     ms/TemporalInstant]
   [:first_name      [:maybe :string]]
   [:last_name       [:maybe :string]]
   [:last_login      [:maybe ms/TemporalInstant]]
   [:is_superuser    :boolean]
   [:is_data_analyst :boolean]
   [:is_qbnewb       :boolean]
   [:tenant_id       [:maybe ms/PositiveInt]]
   [:common_name     [:maybe :string]]])

(mu/defn user-summaries-by-id :- [:map-of UserSummariesById [:map {:closed true}
                                                             [:id              ::lib.schema.id/user]
                                                             [:email           :string]
                                                             [:date_joined     ms/TemporalInstant]
                                                             [:first_name      [:maybe :string]]
                                                             [:last_name       [:maybe :string]]
                                                             [:last_login      [:maybe ms/TemporalInstant]]
                                                             [:is_superuser    :boolean]
                                                             [:is_data_analyst :boolean]
                                                             [:is_qbnewb       :boolean]
                                                             [:tenant_id       [:maybe ms/PositiveInt]]
                                                             [:common_name     [:maybe :string]]]]
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(def ^:private CardsWithModeratedStatus
  "Rows returned by [[cards-with-moderated-status]]."
  [:map {:closed true}
   [:id                                        ::lib.schema.id/card]
   [:created_at                                ms/TemporalInstant]
   [:updated_at                                ms/TemporalInstant]
   [:name                                      :string]
   [:description                               [:maybe [:or :string :map sequential?]]]
   [:display                                   [:or :keyword :string]]
   [:dataset_query                             [:or :string :map sequential?]]
   [:visualization_settings                    [:or :string :map sequential?]]
   [:creator_id                                ::lib.schema.id/user]
   [:database_id                               ::lib.schema.id/database]
   [:table_id                                  [:maybe ::lib.schema.id/table]]
   [:query_type                                [:maybe [:or :keyword :string]]]
   [:archived                                  :boolean]
   [:collection_id                             [:maybe ::lib.schema.id/collection]]
   [:public_uuid                               [:maybe [:or :string uuid?]]]
   [:made_public_by_id                         [:maybe ms/PositiveInt]]
   [:enable_embedding                          :boolean]
   [:embedding_params                          [:maybe [:or :string :map sequential?]]]
   [:cache_ttl                                 [:maybe :int]]
   [:result_metadata                           [:maybe [:or :string :map sequential?]]]
   [:collection_position                       [:maybe :int]]
   [:entity_id                                 :string]
   [:parameters                                [:maybe [:or :string :map sequential?]]]
   [:parameter_mappings                        [:maybe [:or :string :map sequential?]]]
   [:collection_preview                        :boolean]
   [:metabase_version                          [:maybe :string]]
   [:type                                      [:or :keyword :string]]
   [:initially_published_at                    [:maybe ms/TemporalInstant]]
   [:cache_invalidated_at                      [:maybe ms/TemporalInstant]]
   [:last_used_at                              ms/TemporalInstant]
   [:view_count                                :int]
   [:archived_directly                         :boolean]
   [:dataset_query_metrics_v2_migration_backup [:maybe [:or :string :map sequential?]]]
   [:source_card_id                            [:maybe ::lib.schema.id/card]]
   [:dashboard_id                              [:maybe ::lib.schema.id/dashboard]]
   [:card_schema                               :int]
   [:document_id                               [:maybe ms/PositiveInt]]
   [:legacy_query                              [:maybe [:or :string :map sequential?]]]
   [:embedding_type                            [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix                        [:maybe :string]]
   [:dimensions                                [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings                        [:maybe [:or :string :map sequential?]]]
   [:metabot_conversation_id                   [:maybe :string]]
   [:metabot_chart_id                          [:maybe :string]]])

(mu/defn cards-with-moderated-status :- [:sequential (mut/optional-keys (mut/open-schema CardsWithModeratedStatus))]
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
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
