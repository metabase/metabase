(ns metabase.lib.schema.join
  "Schemas for things related to joins."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::join
  [:map
   [:lib/type [:= :mbql/join]]
   [:lib/options ::common/options]
   [:stages [:ref :metabase.lib.schema/stages]]
   [:condition ::expression/boolean]])

(mr/def ::joins
  [:sequential [:ref ::join]])
