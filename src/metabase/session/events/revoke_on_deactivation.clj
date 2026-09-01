(ns metabase.session.events.revoke-on-deactivation
  "Delete a user's sessions when they are deactivated, so a later reactivation can't revive a
   pre-deactivation session cookie. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-credentials-revoked ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [user-id] :as _event}]
  (t2/delete! :model/Session 'user_id user-id))
