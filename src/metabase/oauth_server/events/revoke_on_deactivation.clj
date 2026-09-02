(ns metabase.oauth-server.events.revoke-on-deactivation
  "Revoke a user's OAuth access and refresh tokens when they are deactivated, so a later reactivation
   can't revive a pre-deactivation token. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [metabase.oauth-server.queries :as oauth-server.queries]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-credentials-revoked ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [user-id] :as _event}]
  (oauth-server.queries/revoke-access-tokens-for-user! user-id)
  (oauth-server.queries/revoke-refresh-tokens-for-user! user-id)
  (oauth-server.queries/delete-authorization-codes-for-user! user-id))
