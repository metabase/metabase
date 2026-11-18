(ns metabase.session.events.revoke-on-deactivation
  "End a user's sessions when they are deactivated, so a later reactivation can't revive a pre-deactivation session
   cookie. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [metabase.session.db :as session.db]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-update ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [object user-id] :as event}]
  (when (and (false? (:is_active object)) (u.events/changed? event :is_active))
    (session.db/end-sessions! {:user_id (:id object)} "user-deactivated" user-id)))
