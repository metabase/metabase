(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card card-id))

(mu/defn card-embedding-params :- [:maybe :any]
  "The embedding parameters of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :embedding_params :model/Card :id card-id))

(mu/defn card-embedding-flags :- [:maybe (ms/InstanceOf :model/Card)]
  "The embedding-enabled and archived flags of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :enable_embedding :archived] :id card-id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-embedding-params :- [:maybe :any]
  "The embedding parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))

(mu/defn dashboard-embedding-flags :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The embedding-enabled and archived flags of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one [:model/Dashboard :enable_embedding :archived] :id dashboard-id))

(mu/defn dashcard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard dashcard-id))

(mu/defn embedding-themes :- [:sequential (ms/InstanceOf :model/EmbeddingTheme)]
  "The id, entity id, name, settings, and timestamps of every EmbeddingTheme, oldest first."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]
                                    :select [:id :entity_id :name :settings :created_at :updated_at]}))

(mu/defn embedding-theme-exists? :- :boolean
  "Whether an EmbeddingTheme with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/EmbeddingTheme :id id))

(mu/defn embedding-theme :- [:maybe (ms/InstanceOf :model/EmbeddingTheme)]
  "The EmbeddingTheme with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/EmbeddingTheme :id id))

(mu/defn insert-embedding-theme! :- (ms/InstanceOf :model/EmbeddingTheme)
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:name     :string]
           [:settings :map]]]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(mu/defn insert-embedding-themes! :- :int
  "Insert the EmbeddingTheme `rows`."
  [rows :- [:sequential [:map {:closed true}
                         [:name     :string]
                         [:settings :map]]]]
  (t2/insert! :model/EmbeddingTheme rows))

(mu/defn update-embedding-theme! :- :int
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:name     {:optional true} :string]
               [:settings {:optional true} :map]]]
  (t2/update! :model/EmbeddingTheme id changes))

(mu/defn delete-embedding-theme! :- :int
  "Delete the EmbeddingTheme with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/EmbeddingTheme :id id))
