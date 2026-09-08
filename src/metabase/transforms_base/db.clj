(ns metabase.transforms-base.db
  "Application database queries for the transforms base module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn transform-source :- [:maybe :map]
  "The source of the Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one-fn :source [:model/Transform :id :source] transform-id))

(def ^:private TransformsForOrdering
  "Rows returned by [[transforms-for-ordering]]."
  [:map {:closed true}
   [:id                 ::lib.schema.id/transform]
   [:name               [:or :string :map sequential?]]
   [:target             [:or :string :map sequential?]]
   [:target_table_id    [:maybe ::lib.schema.id/table]]
   [:source_database_id [:maybe ::lib.schema.id/database]]
   [:table_dependencies [:maybe [:or :string :map sequential?]]]])

(mu/defn transforms-for-ordering :- [:sequential TransformsForOrdering]
  "The id, name, target, target Table id, source Database id, and table dependencies of every Transform
   excluding [[transform-id]]."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select [:model/Transform :id :name :target :target_table_id :source_database_id :table_dependencies]
             :id [:not= transform-id]))

(def ^:private Transform
  "Rows returned by [[transform]]."
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

(mu/defn transform :- [:maybe Transform]
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform transform-id))

(mu/defn update-transform! :- :int
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform
   changes      :- [:map {:closed true}
                    [:last_checkpoint_value {:optional true} [:maybe [:or :string :map sequential?]]]
                    [:target_table_id       {:optional true} [:maybe ::lib.schema.id/table]]]]
  (t2/update! :model/Transform transform-id changes))

(mu/defn update-transform-run! :- :int
  "Apply `changes` to the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:checkpoint_filter_field_id {:optional true} [:maybe ::lib.schema.id/field]]
               [:checkpoint_lo_value        {:optional true} [:maybe [:or :string :map sequential?]]]
               [:checkpoint_hi_value        {:optional true} [:maybe [:or :string :map sequential?]]]]]
  (t2/update! :model/TransformRun run-id changes))

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
   [:is_stub                     :boolean]])

(mu/defn database :- [:maybe Database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(def ^:private FieldTableId
  "Rows returned by [[field-table-id]]."
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

(mu/defn field-table-id :- [:maybe FieldTableId]
  "The Table id of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field field-id))

(def ^:private TargetTable
  "Rows returned by [[target-table]]."
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

(mu/defn target-table :- [:maybe TargetTable]
  "The Table named `table-name` in `schema` of the Database with `database-id` also matching the key-value
  `conditions`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string
   & conditions :- [:* :some]]
  (apply t2/select-one :model/Table :db_id database-id :schema schema :name table-name conditions))

(def ^:private Table
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

(mu/defn table :- [:maybe Table]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table table-id))

(def ^:private TableForTransform
  "Rows returned by [[table-for-transform]]."
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

(mu/defn table-for-transform :- [:maybe TableForTransform]
  "The Table owned by the Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Table :transform_id transform-id))

(mu/defn update-table! :- :int
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ::lib.schema.id/table
   changes  :- [:map {:closed true}
                [:schema       {:optional true} [:maybe :string]]
                [:active       {:optional true} [:maybe :boolean]]
                [:transform_id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/update! :model/Table table-id changes))

(mu/defn mark-table-index-failed! :- :int
  "Mark the TableIndex named `index-name` of the Transform with `transform-id` failed with `error-message`."
  [transform-id  :- ::lib.schema.id/transform
   index-name    :- :string
   error-message :- :string]
  (t2/update! :model/TableIndex
              :transform_id transform-id :index_name index-name
              {:status :failed :error_message error-message :last_executed_at :%now}))

(mu/defn delete-table-indexes! :- :int
  "Delete the TableIndexes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/TableIndex :id [:in ids]))

(mu/defn update-table-indexes! :- :int
  "Apply `changes` to the TableIndexes with `ids`."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- [:map {:closed true}
               [:status           {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
               [:last_executed_at {:optional true} [:maybe ms/TemporalInstant]]
               [:error_message    {:optional true} [:maybe [:or :string :map sequential?]]]]]
  (t2/update! :model/TableIndex :id [:in ids] changes))

(mu/defn active-field-names-for-table :- [:maybe [:sequential :string]]
  "The names of the active Fields of the Table with `table-id`, in position order."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-vec :name [:model/Field :name :position]
                    :table_id table-id :active true
                    {:order-by [[:position :asc]]}))

(def ^:private TableRefsMatching
  "Rows returned by [[table-refs-matching]]."
  [:map {:closed true}
   [:id     ::lib.schema.id/table]
   [:db_id  ::lib.schema.id/database]
   [:schema [:maybe :string]]
   [:name   :string]])

(mu/defn table-refs-matching :- [:sequential TableRefsMatching]
  "The id, Database id, schema, and name of the Tables matching any of `refs` (each a `[db-id schema table-name]`
  triple; `schema` may be nil)."
  [refs :- [:sequential [:tuple ms/PositiveInt [:maybe :string] :string]]]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:where (into [:or]
                           (map (fn [[db-id schema table-name]]
                                  [:and
                                   [:= :db_id db-id]
                                   (if (some? schema)
                                     [:= :schema schema]
                                     [:is :schema nil])
                                   [:= :name table-name]]))
                           refs)}))

(def ^:private TableRef
  "Rows returned by [[table-refs]]."
  [:map {:closed true}
   [:id     ::lib.schema.id/table]
   [:db_id  ::lib.schema.id/database]
   [:schema [:maybe :string]]
   [:name   :string]])

(mu/defn table-refs :- [:sequential TableRef]
  "The id, Database id, schema, and name of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :schema :name] :id [:in table-ids]))
