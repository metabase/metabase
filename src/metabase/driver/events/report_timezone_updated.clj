(ns metabase.driver.events.report-timezone-updated
  (:require
   [metabase.driver-api.core :as driver-api]
   [metabase.mq.core :as mq]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/report-timezone-updated ::event)

(methodical/defmethod driver-api/publish-event! ::event
  "When the report-timezone Setting is updated, publish to the connection-pool-invalidated topic
  so all databases get their pools flushed. Local listeners fire immediately inline."
  [_topic _event]
  (mq/with-topic :topic/connection-pool-invalidated [t]
    (mq/put t {:all-databases true})))
