(ns metabase.internal-stats.data-apps
  (:require
   [toucan2.core :as t2]))

(defn data-app-stats
  "How many enabled data apps this instance serves."
  []
  {:data-app-count (t2/count :data_app :enabled true)})
