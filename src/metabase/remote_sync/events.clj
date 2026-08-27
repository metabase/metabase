(ns metabase.remote-sync.events
  "Derives remote sync event keywords from :metabase/event so they can be published
   without requiring ee code to be loaded."
  (:require
   [metabase.events.core :as events]))

;; Collection events
(events/derive! ::collection-event :metabase/event)
(events/derive! :event/collection-create ::collection-event)
(events/derive! :event/collection-update ::collection-event)

;; Field events
(events/derive! ::field-event :metabase/event)
(events/derive! :event/field-update ::field-event)

;; Table events
(events/derive! ::table-event :metabase/event)
(events/derive! :event/table-update ::table-event)
(events/derive! :event/table-publish ::table-event)
(events/derive! :event/table-unpublish ::table-event)

;; Timeline events
(events/derive! ::timeline-event :metabase/event)
(events/derive! :event/timeline-create ::timeline-event)
(events/derive! :event/timeline-delete ::timeline-event)
(events/derive! :event/timeline-update ::timeline-event)

;; Snippet events are derived in the the ...models.native-query-snippet interface
;; with some indirection

;; Transform Tag events
(events/derive! ::transform-tag-event :metabase/event)
(events/derive! :event/transform-tag-create ::transform-tag-event)
(events/derive! :event/transform-tag-update ::transform-tag-event)
(events/derive! :event/transform-tag-delete ::transform-tag-event)

;; Transform Run events
(events/derive! ::transform-run-event :metabase/event)
(events/derive! :event/transform-run-complete ::transform-run-event)

;; Transform events
(events/derive! ::transform-event :metabase/event)
(events/derive! :event/create-transform ::transform-event)
(events/derive! :event/update-transform ::transform-event)
(events/derive! :event/delete-transform ::transform-event)
