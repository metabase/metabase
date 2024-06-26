(ns metabase.pulse
  "Public API for sending Pulses."
  (:require
   [metabase.notification.core :as noti]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sending Notifications                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the content, and sending the content to any specified destination.

  `channel-ids` is the set of channel IDs to send to *now* -- this may be a subset of the full set of channels for
  the Pulse.

   Example:

    (send-pulse! pulse)                    ; Send to all Channels
    (send-pulse! pulse  [312]) ; Send only to Channel with :id = 312"
  [pulse & {:keys [channel-ids]}]
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  (noti/send-notification! {:payload_type (if (:dashboard_id pulse)
                                            :notification/dashboard-subscription
                                           :notificaiton/alert)
                            :payload_id    (:id pulse)}pulse channel-ids))
