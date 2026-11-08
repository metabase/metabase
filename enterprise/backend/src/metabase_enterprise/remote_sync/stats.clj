(ns metabase-enterprise.remote-sync.stats
  "Counts of Git-synced content for the anonymous stats ping."
  (:require
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync.synced]))

(set! *warn-on-reflection* true)

(def ^:private model-count-keys
  {:model/Action             :remote-sync-action-count
   :model/Dashboard          :remote-sync-dashboard-count
   :model/DataApp            :remote-sync-data-app-count
   :model/Document           :remote-sync-document-count
   :model/FieldUserSettings  :remote-sync-field-user-settings-count
   :model/Glossary           :remote-sync-glossary-entry-count
   :model/Measure            :remote-sync-measure-count
   :model/NativeQuerySnippet :remote-sync-snippet-count
   :model/Segment            :remote-sync-segment-count
   :model/TableUserSettings  :remote-sync-table-user-settings-count
   :model/Timeline           :remote-sync-timeline-count
   :model/Transform          :remote-sync-transform-count})

(defenterprise remote-sync-stats
  "Counts of the synced content, by model and in total, empty without Git sync."
  :feature :remote-sync
  []
  (if-let [ctx (remote-sync/context)]
    (let [counts      (into {}
                            (map (fn [model]
                                   [model (remote-sync.db/count-in model (remote-sync.synced/synced-ids model ctx))]))
                            (content/exported-models ctx))
          card-counts (remote-sync.db/synced-card-counts-by-type (remote-sync.synced/synced-ids :model/Card ctx))]
      (merge (into {} (map (fn [[model k]] [k (get counts model 0)])) model-count-keys)
             {:remote-sync-card-count     (reduce + 0 (vals card-counts))
              :remote-sync-model-count    (get card-counts :model 0)
              :remote-sync-question-count (get card-counts :question 0)
              :remote-sync-metric-count   (get card-counts :metric 0)
              :remote-sync-content-count  (reduce + 0 (vals counts))}))
    {}))
