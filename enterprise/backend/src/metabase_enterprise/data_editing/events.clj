(ns metabase-enterprise.data-editing.events
  (:require
   [metabase.events.notification :as events.notification]))

(derive ::event :metabase/event)

(derive :event/rows.created ::event)
(derive :event/rows.updated ::event)
(derive :event/rows.deleted ::event)

(doseq [event [:event/rows.created
               :event/rows.updated
               :event/rows.deleted]]
  (defmethod events.notification/notification-filter-for-topic event
    [_topic event-info]
    [:= :table_id (-> event-info :args :table_id)]))
