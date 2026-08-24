(ns metabase-enterprise.support-access-grants.events
  (:require
   [metabase.events.core :as events]))

(events/derive! ::event :metabase/event)
(events/derive! :event/support-access-grant-created ::event)
