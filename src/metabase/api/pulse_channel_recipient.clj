(ns metabase.api.pulse-channel-recipient
  "/api/pulse-channel-recipient endpoints."
  (:require [compojure.core :refer [DELETE]]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [metabase.api.common :as api]
            [metabase.events :as events]
            [toucan.db :as db]))

(api/defendpoint DELETE "/:id"
  "Delete a Pulse. (DEPRECATED -- don't delete a Pulse anymore -- archive it instead.)"
  [id]
  (api/let-404 [pcr (PulseChannelRecipient id)]
               (api/write-check PulseChannelRecipient id)
               (db/delete! PulseChannelRecipient :id id)
               (events/publish-event! :pulse-channel-recipient-delete (assoc pcr :actor_id api/*current-user-id*)))
  api/generic-204-no-content)
