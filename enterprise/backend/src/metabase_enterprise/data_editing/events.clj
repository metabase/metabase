(ns metabase-enterprise.data-editing.events
  (:require
   [metabase.events.notification :as events.notification]))

(derive ::event :metabase/event)

(derive :event/rows.created ::event)
(derive :event/rows.updated ::event)
(derive :event/rows.deleted ::event)
(derive :event/row.created ::event)
(derive :event/row.updated ::event)
(derive :event/row.deleted ::event)

(doseq [event (descendants ::event)]
  (defmethod events.notification/notification-filter-for-topic event
    [_topic event-info]
    [:= :table_id (-> event-info :args :table_id)]))
