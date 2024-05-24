(ns metabase.channel.interface)

(defmulti can-connect?
  {:arglists '([channel])}
  :kind)

(defmulti send-notification!
  (fn [channel notification-type _recipients _payload]
    [(:kind channel) notification-type]))
