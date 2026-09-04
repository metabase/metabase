(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card card-id))

(defn card-embedding-params
  "The embedding parameters of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :embedding_params :model/Card :id card-id))

(defn card-embedding-flags
  "The embedding-enabled and archived flags of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :enable_embedding :archived] :id card-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard dashboard-id))

(defn dashboard-embedding-params
  "The embedding parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))

(defn dashboard-embedding-flags
  "The embedding-enabled and archived flags of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :enable_embedding :archived] :id dashboard-id))

(defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one :model/DashboardCard dashcard-id))

(defn embedding-themes
  "The id, entity id, name, settings, default flag, and timestamps of every EmbeddingTheme, oldest first."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]
                                    :select [:id :entity_id :name :settings :is_default :created_at :updated_at]}))

(defn embedding-theme-exists?
  "Whether an EmbeddingTheme with `id` exists."
  [id]
  (t2/exists? :model/EmbeddingTheme :id id))

(defn embedding-theme
  "The EmbeddingTheme with `id`, or nil."
  [id]
  (t2/select-one :model/EmbeddingTheme :id id))

(defn insert-embedding-theme!
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(defn insert-embedding-themes!
  "Insert the EmbeddingTheme `rows`."
  [rows]
  (t2/insert! :model/EmbeddingTheme rows))

(defn update-embedding-theme!
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id changes]
  (t2/update! :model/EmbeddingTheme id changes))

(defn delete-embedding-theme!
  "Delete the EmbeddingTheme with `id`."
  [id]
  (t2/delete! :model/EmbeddingTheme :id id))
