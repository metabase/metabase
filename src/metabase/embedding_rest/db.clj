(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn embedding-themes
  "The id, entity id, name, settings, default flag, and timestamps of every EmbeddingTheme, oldest first."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]
                                    :select [:id :entity_id :name :settings :is_default :created_at :updated_at]}))

(mu/defn embedding-theme-exists?
  "Whether an EmbeddingTheme with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/EmbeddingTheme :id id))

(mu/defn insert-embedding-theme!
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(mu/defn insert-embedding-themes!
  "Insert the EmbeddingTheme `rows`. Only seeding - the Light/Dark themes written on the first visit
  to the embedding hub - sets `is_default`, so the single-row insert above leaves it out."
  [rows :- [:sequential (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings :is_default])]]
  (t2/insert! :model/EmbeddingTheme rows))

(mu/defn update-embedding-theme!
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/update! :model/EmbeddingTheme id changes))

(mu/defn delete-embedding-theme!
  "Delete the EmbeddingTheme with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/EmbeddingTheme :id id))

(mu/defn sdk-react-18-hosts-last-seen-after :- [:sequential ::embedding.schema/sdk-react-18-host]
  "The EmbeddingSdkReact18Hosts last seen after `cutoff`, newest first, at most `limit`."
  [cutoff :- ms/TemporalInstant
   limit  :- ms/PositiveInt]
  (t2/select :model/EmbeddingSdkReact18Host {:select   [:id :host :created_at :last_seen_at]
                                             :where    [:> :last_seen_at [:auto/param cutoff]]
                                             :order-by [[:last_seen_at :desc] [:id :desc]]
                                             :limit    limit}))
