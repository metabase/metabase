(ns metabase.internal-stats.data-apps
  (:require
   [metabase.internal-stats.db :as internal-stats.db]))

(defn data-app-stats
  "How many data apps this instance actually serves: enabled and synced without
  error (`sync_error IS NULL`), matching what the UI treats as an openable app."
  []
  {:data-app-count (internal-stats.db/enabled-data-app-count)})
