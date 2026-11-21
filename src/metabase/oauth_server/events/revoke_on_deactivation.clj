(ns metabase.oauth-server.events.revoke-on-deactivation
  "Revoke a user's OAuth access and refresh tokens when they are deactivated, so a later reactivation
   can't revive a pre-deactivation token. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [metabase.oauth-server.models.oauth-access-token :as oauth-access-token]
   [metabase.oauth-server.models.oauth-authorization-code :as oauth-authorization-code]
   [metabase.oauth-server.models.oauth-refresh-token :as oauth-refresh-token]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-update ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [changes]}]
  (when-let [user-ids (not-empty (into []
                                       (comp (filter #(and (false? (:is_active (:object %)))
                                                           (u.events/changed? % :is_active)))
                                             (map (comp :id :object)))
                                       changes))]
    (oauth-access-token/revoke-user-oauth-access-tokens! user-ids)
    (oauth-refresh-token/revoke-user-oauth-refresh-tokens! user-ids)
    (oauth-authorization-code/delete-user-oauth-authorization-codes! user-ids)))
