(ns metabase.channel.events.persisted-model-refresh-error
  "Event handler for the `:event/persisted-model-refresh-error` event defined
  in [[metabase.model-persistence.events.persisted-model-refresh-error]]."
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [methodical.core :as methodical])
  (:import
   (org.quartz Trigger)))

(set! *warn-on-reflection* true)

(derive :event/persisted-model-refresh-error ::event)

;; Maps the Quartz job-data `"type"` value (set by `database-trigger` /
;; `individual-trigger` in [[metabase.model-persistence.task.persist-refresh]]) to the
;; human-readable label rendered as `Last run trigger` in the failure email. Keep in sync
;; with those trigger constructors.
(def ^:private trigger-type->display-label
  {"database"   "Scheduled"
   "individual" "Manual"})

(defn- trigger-display-label [^Trigger trigger]
  (some-> trigger .getJobDataMap (.get "type") trigger-type->display-label))

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [database-id persisted-infos trigger]}]
  (messages/send-persistent-model-error-email!
   database-id
   persisted-infos
   (trigger-display-label trigger)))
