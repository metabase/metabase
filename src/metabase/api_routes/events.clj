(ns metabase.api-routes.events
  (:require
   [metabase.api-routes.routes :as routes]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive ::api-events :metabase/event)
(derive :event/api-handler-update ::api-events)

;; Should be triggered in dev mode only to update the openapi.json doc when api schemas change this then will update
;; the metabase-types for FE via hot-reloading. This used to live in metabase.api.events. But because it needs a
;; reference to all routes, that brought a module usage of api-routes. But this is a can of worms because
;; api-routes (must) use all modules to expose the routes. So now this is a bit split brain: the
;; api.docs/request-spec-regenerartion function is sent over in the event payload from the api module and the event
;; handler is registered in this module which has access to all of the routes.
(methodical/defmethod events/publish-event! ::api-events
  [_topic {rebuild-fn :api.docs/request-rebuild :as _event}]
  (try
    (log/debug "Requesting OpenAPI regeneration")
    (if rebuild-fn
      (rebuild-fn routes/routes)
      (log/debug "No build function provided to rebuild OpenAPI docs"))
    (catch Throwable e
      (log/debug e "Failed to trigger OpenAPI regeneration"))))
