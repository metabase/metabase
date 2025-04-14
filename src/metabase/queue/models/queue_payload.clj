(ns metabase.queue.models.queue-payload
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueuePayload [_model] :queue_payload)

(doto :model/QueuePayload
  (derive :metabase/model))

(t2/deftransforms :model/QueuePayload
  {:payload    mi/transform-json})
