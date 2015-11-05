(ns metabase.models.pulse-channel-recipient
  (:require [korma.core :as k]
            [metabase.models.interface :refer :all]))

(defentity PulseChannelRecipient
  [(k/table :pulse_channel_recipient)])
