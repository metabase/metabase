(ns metabase-enterprise.remote-sync.stats
  "Counts of Git-synced content for the anonymous stats ping."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(def ^:private model-count-keys
  {"Action"             :remote-sync-action-count
   "Dashboard"          :remote-sync-dashboard-count
   "DataApp"            :remote-sync-data-app-count
   "Dimension"          :remote-sync-dimension-count
   "Document"           :remote-sync-document-count
   "FieldUserSettings"  :remote-sync-field-user-settings-count
   "Glossary"           :remote-sync-glossary-entry-count
   "Measure"            :remote-sync-measure-count
   "NativeQuerySnippet" :remote-sync-snippet-count
   "Segment"            :remote-sync-segment-count
   "TableUserSettings"  :remote-sync-table-user-settings-count
   "Timeline"           :remote-sync-timeline-count
   "Transform"          :remote-sync-transform-count})

(defn- card-type-counts
  [card-ids]
  (let [counts (transduce (map #(remote-sync.db/card-counts-by-type (vec %)))
                          (partial merge-with +)
                          {}
                          (partition-all impl/app-db-batch-size card-ids))]
    {:remote-sync-card-count     (reduce + 0 (vals counts))
     :remote-sync-model-count    (get counts :model 0)
     :remote-sync-question-count (get counts :question 0)
     :remote-sync-metric-count   (get counts :metric 0)}))

(defenterprise remote-sync-stats
  "Counts of the content a full Git sync export serializes, by model and in total, empty without Git sync."
  :feature :remote-sync
  []
  (if (settings/remote-sync-enabled)
    (let [entities (spec/exportable-entities)]
      (merge (into {} (map (fn [[model k]] [k (count (get entities model))])) model-count-keys)
             (card-type-counts (get entities "Card"))
             {:remote-sync-content-count (spec/exportable-entity-count entities)}))
    {}))
