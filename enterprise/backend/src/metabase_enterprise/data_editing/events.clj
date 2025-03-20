(ns metabase-enterprise.data-editing.events)

(derive ::event :metabase/event)

(derive :event/data-editing-row-create ::event)
(derive :event/data-editing-row-update ::event)
(derive :event/data-editing-row-delete ::event)
