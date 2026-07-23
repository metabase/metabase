(ns metabase.internal-stats.data-apps
  (:require
   [toucan2.core :as t2]))

(defn data-app-stats
  "How many data apps this instance actually serves: enabled and synced without
  error (`sync_error IS NULL`), matching what the UI treats as an openable app."
  []
  {:data-app-count (t2/count :data_app :enabled true :sync_error nil)})
