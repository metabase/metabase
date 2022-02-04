(ns metabase.models.pulse-channel-recipient
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel PulseChannelRecipient :pulse_channel_recipient)

(defn- pre-delete [pcr]
  ;; call [[metabase.models.pulse-channel/will-delete-recipient]] to let it know we're about to delete this
  ;; PulseChannelRecipient; that function will decide whether to automatically delete the PulseChannel as well.
  (classloader/require 'metabase.models.pulse-channel)
  ((resolve 'metabase.models.pulse-channel/will-delete-recipient) pcr))

(u/strict-extend (class PulseChannelRecipient)
  models/IModel
  (merge
   models/IModelDefaults
   {:pre-delete pre-delete}))
