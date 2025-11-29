(ns metabase.documents.view-log
  "Integrates view logging events for documents"
  (:require
   [java-time.api :as t]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.batch-processing.core :as grouper]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [metabase.view-log.core :as view-log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(def ^:private document-statistics-lock
  "keyword to use for locking document updates that can deadlock"
  ::document-statistics-lock)

(derive ::document-read :metabase/event)
(derive :event/document-read ::document-read)

(def ^:private update-document-last-viewed-at-interval-seconds 20)

(defn- update-document-last-viewed-at!* [document-id-timestamps]
  (let [document-id->timestamp (update-vals (group-by :id document-id-timestamps)
                                            (fn [xs] (apply t/max (map :timestamp xs))))]
    (try
      (cluster-lock/with-cluster-lock document-statistics-lock
        (t2/update! :model/Document :id [:in (keys document-id->timestamp)]
                    {:last_viewed_at (into [:case]
                                           (mapcat (fn [[id timestamp]]
                                                     [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                   document-id->timestamp))
                     :updated_at :updated_at})) ;; setting last_viewed_at should not update the updated_at column
      (catch Exception e
        (log/error e "Failed to update document last_viewed_at")))))

(def ^:private update-document-last-viewed-at-queue
  (delay (grouper/start!
          #'update-document-last-viewed-at!*
          :capacity 500
          :interval (* update-document-last-viewed-at-interval-seconds 1000))))

(defn- update-document-last-viewed-at!
  "Update the `last_viewed_at` of a document asynchronously"
  [document-id]
  (let [now (t/offset-date-time)]
    (grouper/submit! @update-document-last-viewed-at-queue {:id document-id
                                                            :timestamp now})))

(m/defmethod events/publish-event! ::document-read
  "Handle processing for the document read event. Logs the document view and increments view count."
  [topic {:keys [object-id user-id] :as event}]
  (span/with-span!
    {:name "view-log-document-read"
     :topic topic
     :user-id user-id}
    (try
      (view-log/increment-view-counts! :model/Document object-id)
      (update-document-last-viewed-at! object-id)
      (view-log/record-views! (view-log/generate-view :model :model/Document event))
      ;; Update recent views alongside existing view log functionality
      (activity-feed/update-users-recent-views! user-id :model/Document object-id :view)
      (catch Throwable e
        (log/warnf e "Failed to process document view event. %s" topic)))))
