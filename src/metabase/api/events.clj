(ns metabase.api.events
  "Event handlers for API-related events."
  (:require
   [metabase.api-routes.core :as api-routes]
   [metabase.api.docs :as api.docs]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(derive :event/api-handler-update :metabase/event)
(derive :event/api-handler-update ::api-events)

(methodical/defmethod events/publish-event! ::api-events
  [_topic _event]
  (try
    (api.docs/request-spec-regeneration! api-routes/routes)
    (catch Throwable e
      (log/debug e "Failed to trigger OpenAPI regeneration"))))
