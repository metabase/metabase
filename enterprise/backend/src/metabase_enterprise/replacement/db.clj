(ns metabase-enterprise.replacement.db
  "Application database queries for the replacement module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private RunRow
  "The writable columns of a ReplacementRun row (excluding `:id`)."
  [:map {:closed true}
   [:source_entity_type {:optional true} :any]
   [:source_entity_id   {:optional true} :any]
   [:target_entity_type {:optional true} :any]
   [:target_entity_id   {:optional true} :any]
   [:status             {:optional true} :any]
   [:is_active          {:optional true} :any]
   [:progress           {:optional true} :any]
   [:message            {:optional true} :any]
   [:user_id            {:optional true} :any]
   [:start_time         {:optional true} :any]
   [:end_time           {:optional true} :any]])

(def ^:private CardRow
  "The writable columns of a Card row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`), plus
  `:verified-result-metadata?`, a non-column flag the Card model's before-update hook consumes and strips (see
  `metabase.queries.models.card/populate-result-metadata`)."
  [:map {:closed true}
   [:verified-result-metadata?                  {:optional true} :any]
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
   [:parameters                                 {:optional true} :any]
   [:parameter_mappings                         {:optional true} :any]
   [:collection_preview                         {:optional true} :any]
   [:metabase_version                           {:optional true} :any]
   [:type                                       {:optional true} :any]
   [:initially_published_at                     {:optional true} :any]
   [:cache_invalidated_at                       {:optional true} :any]
   [:last_used_at                                {:optional true} :any]
   [:view_count                                 {:optional true} :any]
   [:archived_directly                          {:optional true} :any]
   [:dataset_query_metrics_v2_migration_backup  {:optional true} :any]
   [:source_card_id                             {:optional true} :any]
   [:dashboard_id                               {:optional true} :any]
   [:card_schema                                {:optional true} :any]
   [:document_id                                {:optional true} :any]
   [:legacy_query                               {:optional true} :any]])

(def ^:private TransformRow
  "The writable columns of a Transform row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`)."
  [:map {:closed true}
   [:name                    {:optional true} :any]
   [:description             {:optional true} :any]
   [:source                  {:optional true} :any]
   [:target                  {:optional true} :any]
   [:source_type             {:optional true} :any]
   [:creator_id              {:optional true} :any]
   [:source_database_id      {:optional true} :any]
   [:collection_id           {:optional true} :any]
   [:owner_user_id           {:optional true} :any]
   [:owner_email             {:optional true} :any]
   [:target_db_id            {:optional true} :any]
   [:last_checkpoint_value   {:optional true} :any]
   [:target_table_id         {:optional true} :any]
   [:table_dependencies      {:optional true} :any]])

(def ^:private SegmentRow
  "The writable columns of a Segment row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`)."
  [:map {:closed true}
   [:table_id                {:optional true} :any]
   [:creator_id              {:optional true} :any]
   [:name                    {:optional true} :any]
   [:description             {:optional true} :any]
   [:archived                {:optional true} :any]
   [:definition              {:optional true} :any]
   [:points_of_interest      {:optional true} :any]
   [:caveats                 {:optional true} :any]
   [:show_in_getting_started {:optional true} :any]])

(def ^:private MeasureRow
  "The writable columns of a Measure row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`)."
  [:map {:closed true}
   [:table_id            {:optional true} :any]
   [:creator_id          {:optional true} :any]
   [:name                {:optional true} :any]
   [:description         {:optional true} :any]
   [:archived            {:optional true} :any]
   [:definition          {:optional true} :any]
   [:dimensions          {:optional true} :any]
   [:dimension_mappings  {:optional true} :any]])

(def ^:private DashboardRow
  "The writable columns of a Dashboard row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`)."
  [:map {:closed true}
   [:name                     {:optional true} :any]
   [:description              {:optional true} :any]
   [:creator_id               {:optional true} :any]
   [:parameters               {:optional true} :any]
   [:points_of_interest       {:optional true} :any]
   [:caveats                  {:optional true} :any]
   [:show_in_getting_started  {:optional true} :any]
   [:public_uuid              {:optional true} :any]
   [:made_public_by_id        {:optional true} :any]
   [:enable_embedding         {:optional true} :any]
   [:embedding_params         {:optional true} :any]
   [:archived                 {:optional true} :any]
   [:position                 {:optional true} :any]
   [:collection_id            {:optional true} :any]
   [:collection_position      {:optional true} :any]
   [:cache_ttl                {:optional true} :any]
   [:auto_apply_filters       {:optional true} :any]
   [:width                    {:optional true} :any]
   [:initially_published_at   {:optional true} :any]
   [:view_count               {:optional true} :any]
   [:archived_directly        {:optional true} :any]
   [:last_viewed_at           {:optional true} :any]
   [:embedding_type           {:optional true} :any]
   [:public_uuid_prefix       {:optional true} :any]])

(def ^:private DashboardCardRow
  "The writable columns of a DashboardCard row (excluding `:id`, `:created_at`, `:updated_at`, `:entity_id`)."
  [:map {:closed true}
   [:size_x               {:optional true} :any]
   [:size_y               {:optional true} :any]
   [:row                  {:optional true} :any]
   [:col                  {:optional true} :any]
   [:card_id              {:optional true} :any]
   [:dashboard_id         {:optional true} :any]
   [:parameter_mappings   {:optional true} :any]
   [:visualization_settings {:optional true} :any]
   [:action_id            {:optional true} :any]
   [:dashboard_tab_id     {:optional true} :any]
   [:inline_parameters    {:optional true} :any]])

(def ^:private FieldRow
  "The writable columns of a Field row (excluding `:id`, `:created_at`, `:updated_at`)."
  [:map {:closed true}
   [:name                        {:optional true} :any]
   [:base_type                   {:optional true} :any]
   [:semantic_type               {:optional true} :any]
   [:active                      {:optional true} :any]
   [:description                 {:optional true} :any]
   [:preview_display             {:optional true} :any]
   [:position                    {:optional true} :any]
   [:table_id                    {:optional true} :any]
   [:parent_id                   {:optional true} :any]
   [:display_name                {:optional true} :any]
   [:visibility_type             {:optional true} :any]
   [:fk_target_field_id          {:optional true} :any]
   [:last_analyzed               {:optional true} :any]
   [:points_of_interest          {:optional true} :any]
   [:caveats                     {:optional true} :any]
   [:fingerprint                 {:optional true} :any]
   [:fingerprint_version         {:optional true} :any]
   [:database_type               {:optional true} :any]
   [:has_field_values            {:optional true} :any]
   [:settings                    {:optional true} :any]
   [:database_position           {:optional true} :any]
   [:custom_position             {:optional true} :any]
   [:effective_type              {:optional true} :any]
   [:coercion_strategy           {:optional true} :any]
   [:nfc_path                    {:optional true} :any]
   [:database_required           {:optional true} :any]
   [:json_unfolding              {:optional true} :any]
   [:database_is_auto_increment  {:optional true} :any]
   [:database_indexed            {:optional true} :any]
   [:database_partitioned        {:optional true} :any]])

(mu/defn run :- [:maybe (ms/InstanceOf :model/ReplacementRun)]
  "The ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/ReplacementRun :id run-id))

(mu/defn runs :- [:sequential (ms/InstanceOf :model/ReplacementRun)]
  "The ReplacementRuns, newest first, restricted to the `is-active` flag when given."
  [is-active :- [:maybe :boolean]]
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

(mu/defn active-run :- [:maybe (ms/InstanceOf :model/ReplacementRun)]
  "The active ReplacementRun, or nil."
  []
  (t2/select-one :model/ReplacementRun :is_active true))

(mu/defn run-active-flag :- [:maybe (ms/InstanceOf :model/ReplacementRun)]
  "The `:is_active` row of the ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one [:model/ReplacementRun :is_active] :id run-id))

(mu/defn insert-run! :- (ms/InstanceOf :model/ReplacementRun)
  "Insert `run` and return the new instance."
  [run :- RunRow]
  (t2/insert-returning-instance! :model/ReplacementRun run))

(mu/defn update-run! :- :int
  "Apply `changes` to the ReplacementRun with `run-id`, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- RunRow]
  (t2/update! :model/ReplacementRun :id run-id changes))

(mu/defn update-active-run! :- :int
  "Apply `changes` to the ReplacementRun with `run-id` if it is active, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- RunRow]
  (t2/update! :model/ReplacementRun :id run-id :is_active true changes))

(mu/defn time-out-active-runs-older-than! :- :int
  "Mark the active ReplacementRuns started more than `age` `unit`s ago as timed out, returning the number updated."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/update! :model/ReplacementRun
              :is_active true
              :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
              {:status    :timeout
               :is_active nil
               :end_time  :%now
               :message   "Timed out by metabase"}))

(mu/defn cards-with-ids :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Card :id [:in ids]))

(mu/defn tables-with-ids :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in ids]))

(mu/defn dashboards-with-ids :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The Dashboards with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Dashboard :id [:in ids]))

(mu/defn transforms-with-ids :- [:sequential (ms/InstanceOf :model/Transform)]
  "The Transforms with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Transform :id [:in ids]))

(mu/defn segments-with-ids :- [:sequential (ms/InstanceOf :model/Segment)]
  "The Segments with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Segment :id [:in ids]))

(mu/defn measures-with-ids :- [:sequential (ms/InstanceOf :model/Measure)]
  "The Measures with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Measure :id [:in ids]))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Card)]
  "A map of Card ID to Card for `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn card-database-id :- [:maybe ms/PositiveInt]
  "The Database ID of the Card with `card-id`."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :database_id :model/Card :id card-id))

(mu/defn card-with-table-exists? :- :boolean
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [card-ids :- [:seqable ms/PositiveInt]
   table-id :- ms/PositiveInt]
  (t2/exists? :model/Card :id [:in card-ids] :table_id table-id))

(mu/defn update-card! :- :int
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ms/PositiveInt
   changes :- CardRow]
  (t2/update! :model/Card card-id changes))

(mu/defn transform :- [:maybe (ms/InstanceOf :model/Transform)]
  "The Transform with `transform-id`, or nil."
  [transform-id :- ms/PositiveInt]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn update-transform! :- :int
  "Apply `changes` to the Transform with `transform-id`, returning the number updated."
  [transform-id :- ms/PositiveInt
   changes      :- TransformRow]
  (t2/update! :model/Transform transform-id changes))

(mu/defn segment :- [:maybe (ms/InstanceOf :model/Segment)]
  "The Segment with `segment-id`, or nil."
  [segment-id :- ms/PositiveInt]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn update-segment! :- :int
  "Apply `changes` to the Segment with `segment-id`, returning the number updated."
  [segment-id :- ms/PositiveInt
   changes    :- SegmentRow]
  (t2/update! :model/Segment segment-id changes))

(mu/defn measure :- [:maybe (ms/InstanceOf :model/Measure)]
  "The Measure with `measure-id`, or nil."
  [measure-id :- ms/PositiveInt]
  (t2/select-one :model/Measure :id measure-id))

(mu/defn update-measure! :- :int
  "Apply `changes` to the Measure with `measure-id`, returning the number updated."
  [measure-id :- ms/PositiveInt
   changes    :- MeasureRow]
  (t2/update! :model/Measure measure-id changes))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn update-dashboard! :- :int
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ms/PositiveInt
   changes      :- DashboardRow]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn dashboard-cards :- [:sequential (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn update-dashboard-card! :- :int
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ms/PositiveInt
   changes     :- DashboardCardRow]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn table-database-id :- [:maybe ms/PositiveInt]
  "The Database ID of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn active-fields-of-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :active true))

(mu/defn active-field-ids-of-table :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(mu/defn active-fk-to-fields-exists? :- :boolean
  "Whether an active Field points at one of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/exists? :model/Field :fk_target_field_id [:in field-ids] :active true))

(mu/defn update-field! :- :int
  "Apply `changes` to the Field with `field-id`, returning the number updated."
  [field-id :- ms/PositiveInt
   changes  :- FieldRow]
  (t2/update! :model/Field field-id changes))

(mu/defn sandbox-exists-for-table? :- :boolean
  "Whether a Sandbox is defined on the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/exists? :model/Sandbox :table_id table-id))

(mu/defn sandbox-card-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Cards Sandboxes are built on."
  []
  (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil]))

(mu/defn persisted-info-for-card :- [:maybe (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/PersistedInfo :card_id card-id))
