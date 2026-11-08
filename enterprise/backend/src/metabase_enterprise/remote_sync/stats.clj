(ns metabase-enterprise.remote-sync.stats
  "Counts of remote-synced content for the anonymous stats ping."
  (:require
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase.premium-features.core :refer [defenterprise]]))

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
  "Counts of the synced content, by model and in total, empty when remote sync is off."
  :feature :remote-sync
  []
  (if (remote-sync.settings/remote-sync-enabled)
    (let [counts      (into {}
                            (map (fn [model]
                                   [model (remote-sync.db/synced-count model)]))
                            (content/exported-models))
          card-counts (remote-sync.db/synced-card-counts-by-type)]
      (merge (into {} (map (fn [[model k]] [k (get counts model 0)])) model-count-keys)
             {:remote-sync-card-count     (reduce + 0 (vals card-counts))
              :remote-sync-model-count    (get card-counts :model 0)
              :remote-sync-question-count (get card-counts :question 0)
              :remote-sync-metric-count   (get card-counts :metric 0)
              :remote-sync-content-count  (reduce + 0 (vals counts))}))
    {}))
