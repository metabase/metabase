(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.embedding.schema :as embedding.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one :model/Card :id card-id))

(mu/defn active-card
  "The non-archived Card with `card-id`, or nil. A trashed Card keeps its DashboardCard rows, so the dashcard routes
  select it as absent rather than checking `:archived` after the fact."
  [card-id :- ::lib.schema.id/card]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn card-embedding-params
  "The embedding parameters of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one-fn :embedding_params :model/Card :id card-id))

(mu/defn card-embedding-flags
  "The embedding-enabled and archived flags of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one [:model/Card :enable_embedding :archived] :id card-id))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (when-not (pos-int? dashboard-id)
    (throw (ex-info "dashboard-id must be a positive integer" {:dashboard-id dashboard-id})))
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-embedding-params
  "The embedding parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (when-not (pos-int? dashboard-id)
    (throw (ex-info "dashboard-id must be a positive integer" {:dashboard-id dashboard-id})))
  (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))

(mu/defn dashboard-embedding-flags
  "The embedding-enabled and archived flags of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (when-not (pos-int? dashboard-id)
    (throw (ex-info "dashboard-id must be a positive integer" {:dashboard-id dashboard-id})))
  (t2/select-one [:model/Dashboard :enable_embedding :archived] :id dashboard-id))

(mu/defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (when-not (pos-int? dashcard-id)
    (throw (ex-info "dashcard-id must be a positive integer" {:dashcard-id dashcard-id})))
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn embedding-themes
  "The id, entity id, name, settings, default flag, and timestamps of every EmbeddingTheme, oldest first."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]
                                    :select [:id :entity_id :name :settings :is_default :created_at :updated_at]}))

(mu/defn embedding-theme-exists?
  "Whether an EmbeddingTheme with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/EmbeddingTheme :id id))

(mu/defn embedding-theme
  "The EmbeddingTheme with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/EmbeddingTheme :id id))

(mu/defn sdk-react-18-hosts-last-seen-after :- [:sequential ::embedding.schema/sdk-react-18-host]
  "The EmbeddingSdkReact18Hosts last seen after `cutoff`, newest first, at most `limit`."
  [cutoff :- ms/TemporalInstant
   limit  :- ms/PositiveInt]
  (t2/select :model/EmbeddingSdkReact18Host {:select   [:id :host :created_at :last_seen_at]
                                             :where    [:> :last_seen_at cutoff]
                                             :order-by [[:last_seen_at :desc] [:id :desc]]
                                             :limit    limit}))
