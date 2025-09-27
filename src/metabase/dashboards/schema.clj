(ns metabase.dashboards.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::dashboard
  [:map
   [:id         {:optional true} ::lib.schema.id/dashboard]
   [:parameters {:optional true} [:ref ::parameters.schema/parameters]]])
