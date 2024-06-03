(ns metabase.channel.interface)

(defmulti deliver!
  (fn [channel-details payload _recipients _template]
    [(:channel_type channel-details) (:payload-type payload)]))
