(ns metabase.models.pulse-channel-recipient
  (:require
   [metabase.models.interface :as mi]
   [metabase.plugins.classloader :as classloader]
   [toucan.models :as models]))

(models/defmodel PulseChannelRecipient :pulse_channel_recipient)

(defn- pre-delete [pcr]
  ;; call [[metabase.models.pulse-channel/will-delete-recipient]] to let it know we're about to delete this
  ;; PulseChannelRecipient; that function will decide whether to automatically delete the PulseChannel as well.
  (classloader/require 'metabase.models.pulse-channel)
  ((resolve 'metabase.models.pulse-channel/will-delete-recipient) pcr))

(mi/define-methods
 PulseChannelRecipient
 {:pre-delete pre-delete})
