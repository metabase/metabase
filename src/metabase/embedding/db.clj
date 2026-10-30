(ns metabase.embedding.db
  "Application database queries for the embedding module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
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
