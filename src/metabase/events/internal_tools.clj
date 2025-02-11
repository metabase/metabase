(ns metabase.events.table-mutation)

(derive ::event :metabase/event)
(derive :event/table-mutation-cell-update ::event)
