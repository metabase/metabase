(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::transform-source
  [:map
   [:type [:= "query"]]
   [:query [:map [:database :int]]]])

(mr/def ::transform-target
  [:map
   [:type [:enum "table"]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]])

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])
