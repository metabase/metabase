(ns metabase.internal-stats.embedding
  (:require
   [metabase.internal-stats.queries :as internal-stats.queries]))

(defn embedding-dashboard-count
  "Count dashboards enabled for embedding"
  []
  (internal-stats.queries/embedded-dashboard-count))

(defn embedding-question-count
  "Count question cards enabled for embedding"
  []
  (internal-stats.queries/embedded-question-count))
