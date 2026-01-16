(ns metabase.queue.models.queue-message
  "Model definition for the QueueMessage table."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/QueueMessage [_model] :queue_message)

(doto :model/QueueMessage
  (derive :metabase/model))
