(ns metabase.api.events
  "Event handlers for API-related events."
  (:require
   [metabase.api-routes.core :as api-routes]
   [metabase.api.docs :as api.docs]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(derive ::api-events :metabase/event)
(derive :event/api-handler-update ::api-events)

;; Should be triggered in dev mode only to update the openapi.json doc when api schemas change
;; this then will update the metabase-types for FE via hot-reloading
(methodical/defmethod events/publish-event! ::api-events
  [_topic _event]
  (try
    (log/debug "Requesting OpenAPI regeneration")
    (api.docs/request-spec-regeneration! api-routes/routes)
    (catch Throwable e
      (log/debug e "Failed to trigger OpenAPI regeneration"))))
