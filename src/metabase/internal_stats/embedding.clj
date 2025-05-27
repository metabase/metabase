(ns metabase.internal-stats.embedding
  (:require
   [toucan2.core :as t2]))

(defn embedding-dashboard-count
  "Count dashboards enabled for embedding"
  []
  (t2/count :model/Dashboard :enable_embedding true :archived false))

(defn embedding-question-count
  "Count question cards enabled for embedding"
  []
  (t2/count :model/Card :enable_embedding true :archived false :type :question))
