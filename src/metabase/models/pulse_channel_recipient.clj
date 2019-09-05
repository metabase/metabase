(ns metabase.models.pulse-channel-recipient
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel PulseChannelRecipient :pulse_channel_recipient)

(defn- perms-objects-set
  [{:keys [user_id]} _]
  #{(str "/member/" user_id "/")})

(u/strict-extend (class PulseChannelRecipient)
  i/IObjectPermissions
  (merge
    i/IObjectPermissionsDefaults
    {:can-read?         (partial i/current-user-has-full-permissions? :read)
     :can-write?        (partial i/current-user-has-full-permissions? :write)
     :perms-objects-set perms-objects-set}))
