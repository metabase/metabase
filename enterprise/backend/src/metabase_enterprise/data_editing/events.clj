(ns metabase-enterprise.data-editing.events)

(derive ::event :metabase/event)

(derive :event/data-editing-bulk-create ::event)
(derive :event/data-editing-bulk-update ::event)
(derive :event/data-editing-bulk-delete ::event)
