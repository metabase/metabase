(ns metabase.remote-sync.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::context
  [:map {:closed true}
   [:read-only?  :boolean]
   [:library?    :boolean]
   [:transforms? :boolean]])
