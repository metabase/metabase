(ns metabase.internal-stats.data-apps
  (:require
   [metabase.internal-stats.db :as internal-stats.db]))

(defn data-app-stats
  "How many data apps this instance actually serves: enabled ones that aren't drafts."
  []
  {:data-app-count (internal-stats.db/enabled-data-app-count)})
