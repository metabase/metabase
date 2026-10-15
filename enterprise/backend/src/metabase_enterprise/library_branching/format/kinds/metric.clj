(ns metabase-enterprise.library-branching.format.kinds.metric
  "The codec of the kind :metric. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]))

(set! *warn-on-reflection* true)

(def spec "Not implemented yet." {:kind :metric :word "metric" :directory? false :attrs {}})

(defn home "Not implemented yet." [_item] {:dir ["library"]})
(defn refs "Not implemented yet." [_id _attrs] #{})
(defn encode-attrs "Not implemented yet." [attrs] attrs)
(defn decode-attrs "Not implemented yet." [attrs] attrs)

(def codec "Not implemented yet." (common/codec spec))
