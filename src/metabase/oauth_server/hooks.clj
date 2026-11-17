(ns metabase.oauth-server.hooks
  "Hooks that revoke the OAuth tokens of a User who is deactivated, so a later reactivation cannot revive a token
  from before. (SEC-863)"
  (:require
   [metabase.oauth-server.db :as oauth-server.db]))

(defn after-user-deactivated
  "Hook for the User `user-id` as it is deactivated, which revokes their access and refresh tokens and deletes their
  pending authorization codes."
  [user-id]
  (oauth-server.db/revoke-access-tokens-for-user! user-id)
  (oauth-server.db/revoke-refresh-tokens-for-user! user-id)
  (oauth-server.db/delete-authorization-codes-for-user! user-id))
