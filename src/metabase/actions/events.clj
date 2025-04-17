(ns metabase.actions.events)

(derive ::event :metabase/event)

(derive :event/action.invoked ::event)
(derive :event/action.success ::event)
(derive :event/action.failure ::event)
