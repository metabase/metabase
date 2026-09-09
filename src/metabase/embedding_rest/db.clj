(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card card-id))

(mu/defn card-embedding-params :- [:maybe ms/EmbeddingParams]
  "The embedding parameters of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :embedding_params :model/Card :id card-id))

(def ^:private CardEmbeddingFlag
  "Rows returned by [[card-embedding-flags]]."
  (mut/select-keys ::queries.schema/card [:enable_embedding :archived]))

(mu/defn card-embedding-flags :- [:maybe CardEmbeddingFlag]
  "The embedding-enabled and archived flags of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :enable_embedding :archived] :id card-id))

(mu/defn dashboard :- [:maybe ::dashboards.schema/dashboard]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-embedding-params :- [:maybe ms/EmbeddingParams]
  "The embedding parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))

(def ^:private DashboardEmbeddingFlag
  "Rows returned by [[dashboard-embedding-flags]]."
  (mut/select-keys ::dashboards.schema/dashboard [:enable_embedding :archived]))

(mu/defn dashboard-embedding-flags :- [:maybe DashboardEmbeddingFlag]
  "The embedding-enabled and archived flags of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :enable_embedding :archived] :id dashboard-id))

(mu/defn dashcard :- [:maybe ::dashboards.schema/dashboard-card]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard dashcard-id))

(def ^:private EmbeddingTheme
  "Rows returned by [[embedding-themes]]."
  (mut/select-keys ::embedding.schema/embedding-theme [:id :entity_id :name :settings :created_at :updated_at]))

(mu/defn embedding-themes :- [:sequential EmbeddingTheme]
  "The id, entity id, name, settings, and timestamps of every EmbeddingTheme, oldest first."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]
                                    :select [:id :entity_id :name :settings :created_at :updated_at]}))

(mu/defn embedding-theme-exists? :- :boolean
  "Whether an EmbeddingTheme with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/EmbeddingTheme :id id))

(mu/defn embedding-theme :- [:maybe ::embedding.schema/embedding-theme]
  "The EmbeddingTheme with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/EmbeddingTheme :id id))

(mu/defn insert-embedding-theme! :- ::embedding.schema/embedding-theme
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(mu/defn insert-embedding-themes! :- :int
  "Insert the EmbeddingTheme `rows`."
  [rows :- [:sequential (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]]
  (t2/insert! :model/EmbeddingTheme rows))

(mu/defn update-embedding-theme! :- :int
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/update! :model/EmbeddingTheme id changes))

(mu/defn delete-embedding-theme! :- :int
  "Delete the EmbeddingTheme with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/EmbeddingTheme :id id))
