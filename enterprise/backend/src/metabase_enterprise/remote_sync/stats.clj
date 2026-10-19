(ns metabase-enterprise.remote-sync.stats
  "Counts of Git-synced content for the anonymous stats ping."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(def ^:private model-count-keys
  {"Action"             :remote-sync-action-count
   "Card"               :remote-sync-card-count
   "Dashboard"          :remote-sync-dashboard-count
   "DataApp"            :remote-sync-data-app-count
   "Document"           :remote-sync-document-count
   "Glossary"           :remote-sync-glossary-entry-count
   "Measure"            :remote-sync-measure-count
   "NativeQuerySnippet" :remote-sync-snippet-count
   "Segment"            :remote-sync-segment-count
   "Table"              :remote-sync-table-count
   "Timeline"           :remote-sync-timeline-count
   "Transform"          :remote-sync-transform-count})

(defn- card-type-counts
  [card-ids]
  (let [types (frequencies (map :type (when (seq card-ids) (remote-sync.db/card-types (vec card-ids)))))]
    {:remote-sync-model-count    (get types :model 0)
     :remote-sync-question-count (get types :question 0)
     :remote-sync-metric-count   (get types :metric 0)}))

(defenterprise remote-sync-stats
  "Counts of the content a full Git sync export walks, by model, empty without Git sync."
  :feature :remote-sync
  []
  (if (settings/remote-sync-enabled)
    (let [entities (spec/traversed-entities)
          counts   (into {} (map (fn [[model k]] [k (count (get entities model))])) model-count-keys)]
      (merge counts
             (card-type-counts (get entities "Card"))
             {:remote-sync-content-count (reduce + (vals counts))}))
    {}))
