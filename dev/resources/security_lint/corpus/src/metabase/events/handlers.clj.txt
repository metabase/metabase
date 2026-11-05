(ns metabase.events.handlers
  "Security-lint test example: an event handler, which is a defmethod on publish-event!."
  (:require
   [metabase.events.core :as events]
   [methodical.core :as methodical]))

(methodical/defmethod events/publish-event! ::card-create
  [_topic {:keys [object]}]
  (java.util.Random.)
  object)
