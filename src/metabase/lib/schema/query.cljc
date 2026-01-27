(ns metabase.lib.schema.query
  "Schemas for query specifications."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table-source-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :table]]
   [:id [:ref ::lib.schema.id/table]]])

(mr/def ::card-source-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :card]]
   [:id [:ref ::lib.schema.id/card]]])

(mr/def ::source-spec
  [:multi {:dispatch (comp keyword :type)}
   [:table ::table-source-spec]
   [:card ::card-source-spec]])

(mr/def ::column-spec
  [:map
   [:name {:optional true} [:maybe string?]]])

(mr/def ::temporal-bucket-spec
  [:map
   [:unit {:optional true} [:maybe [:ref ::lib.schema.temporal-bucketing/unit]]]])

(mr/def ::breakout-spec
  [:merge
   ::column-spec
   ::temporal-bucket-spec])

(mr/def ::order-by-spec
  [:merge
   ::column-spec
   [:map
    [:direction {:optional true} [:maybe [:ref ::lib.schema.order-by/direction]]]]])

(mr/def ::stage-spec
  [:map
   [:source    {:optional true} [:maybe ::source-spec]]
   [:breakouts {:optional true} [:maybe [:sequential ::breakout-spec]]]
   [:order-bys {:optional true} [:maybe [:sequential ::order-by-spec]]]])

(mr/def ::query-spec
  [:map
   [:stages [:sequential ::stage-spec]]])
