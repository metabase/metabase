(ns metabase.prototype.events
  "Prototype: update the field categories after a metadata sync."
  (:require
   [metabase.events.core :as events]
   [metabase.prototype.field-categories :as field-categories]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/sync-metadata-end ::event)

(methodical/defmethod events/publish-event! ::event
  "After a metadata sync of a Database, update the categories of its Fields in the background: it calls an LLM."
  [_topic {database-id :database_id}]
  (quick-task/submit-task!
   (fn []
     (try
       (field-categories/categorize-database! database-id)
       (catch Throwable e
         (log/errorf e "Prototype field categories: Database %d failed" database-id))))))
