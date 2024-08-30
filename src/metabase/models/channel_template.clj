(ns metabase.models.channel-template
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ChannelTemplate [_model] :channel_template)

(t2/deftransforms :model/ChannelTemplate
  {:channel_type mi/transform-keyword
   :details      mi/transform-json})

(doto :model/ChannelTemplate
  (derive :metabase/model)
  (derive :hook/timestamped?))
