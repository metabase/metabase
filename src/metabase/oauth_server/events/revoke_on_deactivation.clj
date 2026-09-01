(ns metabase.oauth-server.events.revoke-on-deactivation
  "Revoke a user's OAuth access and refresh tokens when they are deactivated, so a later reactivation
   can't revive a pre-deactivation token. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-credentials-revoked ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [user-id] :as _event}]
  (t2/update! :model/OAuthAccessToken  {'user_id user-id, 'revoked_at nil} {:revoked_at :%now})
  (t2/update! :model/OAuthRefreshToken {'user_id user-id, 'revoked_at nil} {:revoked_at :%now})
  (t2/delete! :model/OAuthAuthorizationCode 'user_id user-id))
