(ns metabase.models.channel
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Channel [_model] :channel)

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Channel
  {:type    mi/transform-keyword
   :details mi/transform-encrypted-json})
