(ns ^{:added "0.51.0"} metabase.models.channel
  (:require
   [metabase.channel.core :as channel]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Channel [_model] :channel)

(defmethod mi/can-write? :model/Channel
  [& _]
  (perms/current-user-has-application-permissions? :setting))

(defmethod serdes/entity-id "Channel"
  [_ {:keys [name]}]
  name)

(defmethod serdes/hash-fields :model/Channel
  [_database]
  [:name :type])

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Channel
  {:type    mi/transform-keyword
   :details mi/transform-encrypted-json})

(defn keywordize-type
  "Convert a channel type to a keyword."
  [channel-type]
  (if (and (keyword? channel-type)
           (= "channel" (namespace channel-type)))
    channel-type
    (keyword "channel" (name channel-type))))

(defn create-channel!
  "Create a channel.

  Throw an error if the channel cannot be connected."
  [channel]
  (let [result (channel/can-connect? (keywordize-type (:type channel))
                                     (:details channel))]
    (when (map? result)
     (throw (ex-info (tru "Unable to connect channel") (merge {:type (:type channel)}
                                                              result)))))
  (t2/insert-returning-instance! :model/Channel channel))
