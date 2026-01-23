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

;; Timeline events
(derive ::timeline-event :metabase/event)
(derive :event/timeline-create ::timeline-event)
(derive :event/timeline-delete ::timeline-event)
(derive :event/timeline-update ::timeline-event)

;; Snippet events are derived in the the ...models.native-query-snippet interface
;; with some indirection
