(ns metabase.queue.models.queue-message
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueueMessage [_model] :queue_message)

(doto :model/QueueMessage
  (derive :metabase/model))
