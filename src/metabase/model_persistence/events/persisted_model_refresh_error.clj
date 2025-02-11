(ns metabase.model-persistence.events.persisted-model-refresh-error
  "This event gets triggered when there is an error in the [[metabase.model-persistence.task.persist-refresh]] task.")

(derive ::event :metabase/event)
(derive :event/persisted-model-refresh-error ::event)
