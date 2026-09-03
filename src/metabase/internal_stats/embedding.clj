(ns metabase.internal-stats.embedding
  (:require
   [metabase.internal-stats.db :as internal-stats.db]))

(defn embedding-dashboard-count
  "Count dashboards enabled for embedding"
  []
  (internal-stats.db/embedded-dashboard-count))

(defn embedding-question-count
  "Count question cards enabled for embedding"
  []
  (internal-stats.db/embedded-question-count))
