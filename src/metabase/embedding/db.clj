(ns metabase.embedding.db
  "Application database queries for the embedding module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
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
  (t2/delete! :model/EmbeddingSdkReact18Host :last_seen_at [:< cutoff]))

(mu/defn save-sdk-react-18-host!
  "Insert the EmbeddingSdkReact18Host `host` seen at `seen-at`, or move its `last_seen_at` forward to `seen-at`, in one
  upsert statement on the unique `host`."
  [host    :- :string
   seen-at :- ms/TemporalInstant]
  (t2/query-one
   (case (mdb/db-type)
     :postgres
     {:insert-into   (t2/table-name :model/EmbeddingSdkReact18Host)
      :values        [{:host host :last_seen_at seen-at}]
      :on-conflict   [:host]
      :do-update-set {:last_seen_at [:greatest
                                     (u/qualified-key (t2/table-name :model/EmbeddingSdkReact18Host) :last_seen_at)
                                     :excluded.last_seen_at]}}

     :mysql
     {:insert-into             (t2/table-name :model/EmbeddingSdkReact18Host)
      :values                  [{:host host :last_seen_at seen-at}]
      :on-duplicate-key-update {:last_seen_at [:greatest :last_seen_at [:values :last_seen_at]]}}

     :h2
     {:merge-into              [(t2/table-name :model/EmbeddingSdkReact18Host) :t]
      :using                   [^:allow-subquery {:select [[[:cast host [:varchar 512]] :host]
                                                           [[:cast seen-at :timestamp-with-time-zone] :seen_at]]}
                                :s]
      :on                      [:= :t.host :s.host]
      :when-matched-update-set {:last_seen_at [:greatest :t.last_seen_at :s.seen_at]}
      :when-not-matched-insert [[:host :last_seen_at] [:s.host :s.seen_at]]}))
  nil)
