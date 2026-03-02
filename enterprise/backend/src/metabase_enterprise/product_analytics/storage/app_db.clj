(ns metabase-enterprise.product-analytics.storage.app-db
  "App-DB implementation of the Product Analytics storage multimethods.
   Stores sites, sessions, events, and event-data rows in the Metabase application database."
  (:require
   [metabase-enterprise.product-analytics.models.event]
   [metabase-enterprise.product-analytics.models.event-data]
   [metabase-enterprise.product-analytics.models.session]
   [metabase-enterprise.product-analytics.models.session-data]
   [metabase-enterprise.product-analytics.models.site]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase.app-db.query :as app-db.query]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod storage/get-site ::storage/app-db
  [_backend site-uuid]
  (t2/select-one :model/ProductAnalyticsSite :uuid site-uuid :archived false))

(defmethod storage/upsert-session! ::storage/app-db
  [_backend session-data]
  (let [{:keys [session_uuid site_id]} session-data]
    (app-db.query/update-or-insert!
     :model/ProductAnalyticsSession
     {:session_uuid session_uuid
      :site_id      site_id}
     (fn [existing]
       (if existing
         (merge existing (dissoc session-data :session_uuid :site_id))
         session-data)))))

(defmethod storage/save-event! ::storage/app-db
  [_backend {:keys [event properties]}]
  (t2/with-transaction [_conn]
    (let [event-id (t2/insert-returning-pk! :model/ProductAnalyticsEvent event)]
      (when (seq properties)
        (t2/insert! :model/ProductAnalyticsEventData
                    (mapv #(assoc % :event_id event-id) properties)))
      (t2/select-one :model/ProductAnalyticsEvent :id event-id))))

(defmethod storage/save-session-data! ::storage/app-db
  [_backend session-data-rows]
  (if (seq session-data-rows)
    (t2/insert! :model/ProductAnalyticsSessionData session-data-rows)
    0))

(defmethod storage/set-distinct-id! ::storage/app-db
  [_backend session-id distinct-id]
  (pos? (t2/update! :model/ProductAnalyticsSession session-id {:distinct_id distinct-id})))
