(ns metabase.documents.view-log
  "Integrates view logging events for documents"
  (:require
   [java-time.api :as t]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.batch-processing.core :as grouper]
   [metabase.documents.db :as documents.db]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [metabase.view-log.core :as view-log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(def ^:private document-statistics-lock
  "keyword to use for locking document updates that can deadlock"
  ::document-statistics-lock)

(events/derive! ::document-read :metabase/event)
(events/derive! :event/document-read ::document-read)

(def ^:private update-document-last-viewed-at-interval-seconds 20)

(defn- update-document-last-viewed-at!* [document-id-timestamps]
  (let [document-id->timestamp (update-vals (group-by :id document-id-timestamps)
                                            (fn [xs] (apply t/max (map :timestamp xs))))]
    (try
      ;; :retry-transient? — the body is a single idempotent statement, safe to re-run on a
      ;; multi-master deadlock (e.g. MariaDB Galera, where the cluster lock can't serialize writers).
      (cluster-lock/with-cluster-lock {:lock document-statistics-lock :retry-transient? true}
        (documents.db/update-documents-last-viewed-at! document-id->timestamp))
      (catch Exception e
        (log/errorf "Failed to update document last_viewed_at: %s" (ex-message e))))))

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
      ;; Exploration documents aren't first-class content — they're surfaced only through their
      ;; owning Exploration, and are hidden from search and collection listings. Skip recording
      ;; recent views for them so they don't crowd out real document views in the bucket cap.
      (when (nil? (documents.db/document-exploration-id object-id))
        (activity-feed/update-users-recent-views! user-id :model/Document object-id :view))
      (catch Throwable e
        (log/warnf "Failed to process document view event. %s: %s" topic (ex-message e))))))
