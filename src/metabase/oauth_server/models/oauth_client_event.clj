(ns metabase.oauth-server.models.oauth-client-event
  "Append-only audit trail for the OAuth dynamic client registration (DCR) lifecycle.

   A `registered` event is recorded when a client registers via `POST /oauth/register` (which is
   unauthenticated, so it has no `user_id`). A separate `approved` or `denied` event is recorded for
   each decision a user makes via `POST /oauth/authorize/decision`, stamped with the deciding user's
   `user_id`."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/OAuthClientEvent [_model] :oauth_client_event)

(doto :model/OAuthClientEvent
  (derive :metabase/model))

(defn- client-pk
  "Look up the numeric `oauth_client.id` primary key for the given OAuth `client-id` (UUID)."
  [client-id]
  (oauth-server.db/oauth-client-pk client-id))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn record-registration!
  "Record a `registered` event for the freshly-registered client identified by `client-id` (the OAuth
   UUID). No-op (with a warning) if the client row cannot be found."
  [client-id :- :string]
  (if-let [oauth-client-id (client-pk client-id)]
    (oauth-server.db/insert-client-event! {:oauth_client_id oauth-client-id
                                           :event_type      "registered"})
    (log/warnf "Cannot record OAuth registration event: no client found for client_id %s" client-id)))

(mu/defn record-decision!
  "Record an `approved` or `denied` event for `client-id` (the OAuth UUID), made by `user-id`. No-op
   (with a warning) if the client row cannot be found."
  [client-id :- :string
   user-id   :- [:maybe ::lib.schema.id/user]
   approved? :- :boolean]
  (if-let [oauth-client-id (client-pk client-id)]
    (oauth-server.db/insert-client-event! {:oauth_client_id oauth-client-id
                                           :user_id         user-id
                                           :event_type      (if approved? "approved" "denied")})
    (log/warnf "Cannot record OAuth decision event: no client found for client_id %s" client-id)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/OAuthClientEvent [_model]
  {:skip? false})
