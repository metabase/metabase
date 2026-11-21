(ns metabase.embedding.db
  "Application database queries for the embedding module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn count-embedded-cards
  "Number of Cards that have embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true))

(mu/defn count-embedded-dashboards
  "Number of Dashboards that have embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true))

(mu/defn delete-sdk-react-18-hosts-last-seen-before!
  "Delete the EmbeddingSdkReact18Hosts last seen before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/EmbeddingSdkReact18Host :last_seen_at [:< [:auto/param cutoff]]))

(mu/defn save-sdk-react-18-host!
  "Insert the EmbeddingSdkReact18Host `host` seen at `seen-at`, or move its `last_seen_at` forward to `seen-at`."
  [host    :- :string
   seen-at :- ms/TemporalInstant]
  (mdb/update-or-insert! :model/EmbeddingSdkReact18Host {:host host}
                         (fn [existing]
                           ;; the INSERT also uses this, and GREATEST needs an existing row
                           (if existing
                             {:last_seen_at [:greatest :last_seen_at seen-at]}
                             {:last_seen_at seen-at}))))

(mu/defn insert-embedding-theme!
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row :- ::embedding.schema/embedding-theme.create]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(mu/defn insert-embedding-themes!
  "Insert the EmbeddingTheme `rows`."
  [rows :- [:sequential ::embedding.schema/embedding-theme.create]]
  (t2/insert! :model/EmbeddingTheme rows))

(mu/defn update-embedding-theme!
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/update! :model/EmbeddingTheme :id id changes))

(mu/defn delete-embedding-theme!
  "Delete the EmbeddingTheme with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/EmbeddingTheme :id id))
