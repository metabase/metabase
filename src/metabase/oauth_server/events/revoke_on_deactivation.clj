(ns metabase.oauth-server.events.revoke-on-deactivation
  "Revoke a user's OAuth access and refresh tokens when they are deactivated, so a later reactivation
   can't revive a pre-deactivation token. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [metabase.oauth-server.db :as oauth-server.db]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-credentials-revoked ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [user-id] :as _event}]
  (oauth-server.db/update-oauth-access-tokens! {:user_id user-id :revoked_at_set false} {:revoked_at :%now})
  (oauth-server.db/update-oauth-refresh-tokens! {:user_id user-id :revoked_at_set false} {:revoked_at :%now})
  (oauth-server.db/delete-oauth-authorization-codes! {:user_id user-id}))
