(ns metabase.models.channel
  (:require
   [metabase.channel.core :as channel]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(methodical/defmethod t2/table-name :model/Channel [_model] :channel)

(defmethod mi/can-write? :model/Channel
  [& _]
  (perms/current-user-has-application-permissions? :setting))

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::t2.disallow/delete))

(t2/deftransforms :model/Channel
  {:type    mi/transform-keyword
   :details mi/transform-encrypted-json})

(defn keywordize-type
  [channel-type]
  (if (and (keyword? channel-type)
           (= "channel" (namespace channel-type)))
    channel-type
    (keyword "channel" (name channel-type))))

(defn create-channel!
  [channel]
  (when-not (channel/can-connect? (keywordize-type (:type channel))
                                  (:details channel))
    (throw (ex-info (tru "Unable to connect channel") {:type (:type channel)})))
  (t2/insert-returning-instance! :model/Channel channel))
