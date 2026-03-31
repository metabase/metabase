(ns metabase.driver.events.report-timezone-updated
  (:require
   [metabase.driver-api.core :as driver-api]
   [metabase.mq.core :as mq]
   [metabase.mq.publish :as publish]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/report-timezone-updated ::event)

(methodical/defmethod driver-api/publish-event! ::event
  "When the report-timezone Setting is updated, publish to the connection-pool-invalidated topic
  so all databases get their pools flushed. Must publish immediately (not deferred) because
  callers expect connection pools to be invalidated synchronously — stale sessions with the
  old timezone would produce incorrect query results."
  [_topic event]
  (binding [*out* *err*]
    (println "[TZ-DEBUG] report-timezone-updated event fired:" (pr-str event)))
  (binding [publish/*defer-in-transaction?* false]
    (mq/with-topic :topic/connection-pool-invalidated [t]
      (mq/put t {:all-databases true}))))
