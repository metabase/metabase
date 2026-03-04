(ns metabase.remote-sync.events
  "Derives remote sync event keywords from :metabase/event so they can be published
   without requiring ee code to be loaded.")

;; Collection events
(derive ::collection-event :metabase/event)
(derive :event/collection-create ::collection-event)
(derive :event/collection-update ::collection-event)

;; Field events
(derive ::field-event :metabase/event)
(derive :event/field-update ::field-event)

;; Table events
(derive ::table-event :metabase/event)
(derive :event/table-update ::table-event)
(derive :event/table-publish ::table-event)
(derive :event/table-unpublish ::table-event)

;; Timeline events
(derive ::timeline-event :metabase/event)
(derive :event/timeline-create ::timeline-event)
(derive :event/timeline-delete ::timeline-event)
(derive :event/timeline-update ::timeline-event)

;; Snippet events are derived in the the ...models.native-query-snippet interface
;; with some indirection

;; Transform Tag events
(derive ::transform-tag-event :metabase/event)
(derive :event/transform-tag-create ::transform-tag-event)
(derive :event/transform-tag-update ::transform-tag-event)
(derive :event/transform-tag-delete ::transform-tag-event)

;; Transform Run events
(derive ::transform-run-event :metabase/event)
(derive :event/transform-run-complete ::transform-run-event)

;; Transform events
(derive ::transform-event :metabase/event)
(derive :event/create-transform ::transform-event)
(derive :event/update-transform ::transform-event)
(derive :event/delete-transform ::transform-event)
