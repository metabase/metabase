(ns metabase.dashboards.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::dashcard
  [:map
   [:id   {:optional true} ::lib.schema.id/dashcard]
   [:card {:optional true} [:ref ::queries.schema/card]]])

(mr/def ::dashboard
  [:map
   [:id         {:optional true} ::lib.schema.id/dashboard]
   [:parameters {:optional true} [:ref ::parameters.schema/parameters]]
   [:dashcards  {:optional true} [:maybe [:sequential ::dashcard]]]])
