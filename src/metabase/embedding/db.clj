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

(mu/defn delete-sdk-react-18-hosts-for-cleanup!
  "Delete the EmbeddingSdkReact18Hosts last seen before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/EmbeddingSdkReact18Host :last_seen_at [:< [:auto/param cutoff]]))

(mu/defn save-sdk-react-18-host!
  "Insert the EmbeddingSdkReact18Host `host` seen at `seen-at`, or move its `last_seen_at` forward to `seen-at`, in one
  upsert statement on the unique `host`."
  [host    :- :string
   seen-at :- ms/TemporalInstant]
  (t2/query-one
   (case (mdb/db-type)
     :postgres
     ["INSERT INTO embedding_sdk_react_18_host (host, last_seen_at) VALUES (?, ?)
       ON CONFLICT (host) DO UPDATE SET last_seen_at = GREATEST(embedding_sdk_react_18_host.last_seen_at, EXCLUDED.last_seen_at)"
      host seen-at]

     :mysql
     ["INSERT INTO embedding_sdk_react_18_host (host, last_seen_at) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at))"
      host seen-at]

     :h2
     ["MERGE INTO embedding_sdk_react_18_host AS t
       USING (VALUES (CAST(? AS VARCHAR(512)), CAST(? AS TIMESTAMP WITH TIME ZONE))) AS s (host, seen_at)
       ON t.host = s.host
       WHEN MATCHED THEN UPDATE SET last_seen_at = GREATEST(t.last_seen_at, s.seen_at)
       WHEN NOT MATCHED THEN INSERT (host, last_seen_at) VALUES (s.host, s.seen_at)"
      host seen-at]))
  nil)

(mu/defn insert-embedding-themes!
  "Insert the EmbeddingTheme `rows`, with one statement for each set of columns they give, so that a column a row leaves
  out takes its default, and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::embedding.schema/embedding-theme.create]]
  (let [groups (vals (group-by (comp set keys second) (map-indexed vector rows)))]
    (->> groups
         (mapcat (fn [group]
                   (map vector (map first group) (mdb/insert-returning-instances! :model/EmbeddingTheme (mapv second group)))))
         (sort-by first)
         (mapv second))))

(mu/defn update-embedding-themes!
  "Apply `changes` to the EmbeddingThemes with `ids`."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- (mut/select-keys ::embedding.schema/embedding-theme.update [:name :settings])]
  (t2/update! :model/EmbeddingTheme :id [:in ids] changes))

(mu/defn delete-embedding-themes!
  "Delete the EmbeddingThemes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/EmbeddingTheme :id [:in ids]))
