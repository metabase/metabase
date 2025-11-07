(ns metabase.segments.schema
  (:require
   ;; existing usage, do not use legacy MBQL utils in new code
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.util.malli.registry :as mr]))

(mr/def ::segment
  [:map
   [:filter      {:optional true} [:maybe [:ref ::mbql.s/Filter]]]
   [:aggregation {:optional true} [:maybe [:sequential [:ref ::mbql.s/Aggregation]]]]])
