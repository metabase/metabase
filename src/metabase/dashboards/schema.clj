(ns metabase.dashboards.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::dashcard
  [:map
   [:id   {:optional true} ::lib.schema.id/dashcard]
   [:card {:optional true} [:ref ::queries.schema/card]]])

(mr/def ::parameters
  [:sequential
   ;; the same as the normal parameters schema, but type is optional here.
   [:merge
    ::parameters.schema/parameter
    [:map
     [:type {:optional true} [:ref ::lib.schema.parameter/type]]]]])

(mr/def ::dashboard
  [:map
   [:id         {:optional true} ::lib.schema.id/dashboard]
   [:parameters {:optional true} [:maybe ::parameters]]
   [:dashcards  {:optional true} [:maybe [:sequential ::dashcard]]]])
