(ns metabase.internal-stats.remote-sync
  (:require
   [metabase.internal-stats.db :as internal-stats.db]
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise remote-sync-configuration
  "Whether Git sync and transform sync are configured. Both are false in OSS."
  metabase-enterprise.internal-stats.core
  []
  {:enabled? false :transforms? false})

(def ^:private content-count-keys
  [:remote-sync-card-count :remote-sync-dashboard-count :remote-sync-document-count :remote-sync-timeline-count
   :remote-sync-transform-count :remote-sync-snippet-count :remote-sync-glossary-entry-count :remote-sync-action-count
   :remote-sync-data-app-count :remote-sync-table-count :remote-sync-measure-count :remote-sync-segment-count])

(defn- content-counts [transforms?]
  (let [cards           (internal-stats.db/remote-sync-card-counts)
        library-synced? (internal-stats.db/remote-sync-library?)]
    {:remote-sync-card-count               (:card_count cards)
     :remote-sync-model-count              (:model_count cards)
     :remote-sync-question-count           (:question_count cards)
     :remote-sync-metric-count             (:metric_count cards)
     :remote-sync-dashboard-count          (internal-stats.db/remote-sync-collection-content-count :model/Dashboard)
     :remote-sync-document-count           (internal-stats.db/remote-sync-collection-content-count :model/Document)
     :remote-sync-timeline-count           (internal-stats.db/remote-sync-collection-content-count :model/Timeline)
     :remote-sync-transform-count          (if transforms? (internal-stats.db/transform-count) 0)
     :remote-sync-snippet-count            (if library-synced? (internal-stats.db/active-snippet-count) 0)
     :remote-sync-glossary-entry-count     (if library-synced? (internal-stats.db/glossary-entry-count) 0)
     :remote-sync-action-count             (internal-stats.db/remote-sync-action-count library-synced?)
     :remote-sync-data-app-count           (internal-stats.db/data-app-count)
     :remote-sync-table-count              (internal-stats.db/remote-sync-table-count)
     :remote-sync-measure-count            (internal-stats.db/remote-sync-table-content-count :model/Measure)
     :remote-sync-segment-count            (internal-stats.db/remote-sync-table-content-count :model/Segment)}))

(defn remote-sync-stats
  "Counts active content configured for Git sync, including pending changes. The total counts each item once;
  the card type counts are subsets of the card count. Returns zeros when sync is disabled."
  []
  (let [{:keys [enabled? transforms?]} (remote-sync-configuration)
        counts (if enabled?
                 (content-counts transforms?)
                 (zipmap (into content-count-keys
                               [:remote-sync-model-count :remote-sync-question-count :remote-sync-metric-count])
                         (repeat 0)))]
    (assoc counts :remote-sync-content-count (reduce + (map counts content-count-keys)))))
