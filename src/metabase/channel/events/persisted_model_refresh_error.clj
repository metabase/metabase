(ns metabase.channel.events.persisted-model-refresh-error
  "Event handler for the `:event/persisted-model-refresh-error` event defined
  in [[metabase.model-persistence.events.persisted-model-refresh-error]]."
  (:require
   [metabase.channel-interface.core :as channel-interface]
   [metabase.events.core :as events]
   [methodical.core :as methodical]))

(derive :event/persisted-model-refresh-error ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [database-id persisted-infos trigger]}]
  (channel-interface/send-persistent-model-error-email!
   database-id
   persisted-infos
   trigger))
