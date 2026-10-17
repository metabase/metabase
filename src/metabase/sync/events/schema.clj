(ns metabase.sync.events.schema
  (:require
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

;; Sync publishes this topic, so it must descend from :metabase/event even when no handler is loaded. Derive through a
;; local key, never straight from :metabase/event: a handler also derives the topic from its own key under
;; :metabase/event, and a direct edge next to that path makes `events/underive!` throw.
(events/derive! ::event :metabase/event)
(events/derive! :event/table-fields-added ::event)

(mr/def :event/table-fields-added
  [:map {:closed true}
   [:table-id ::lib.schema.id/table]])
