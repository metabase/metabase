(ns metabase.lib.schema.extraction
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(mr/def ::extraction
  [:map {:closed true, :probe/id "src/metabase/lib/schema/extraction.cljc:7"}
   [:lib/type     [:= :metabase.lib.extraction/extraction]]
   [:tag          [:enum
                   :domain :subdomain :host :path
                   :hour-of-day :day-of-month :day-of-week :month-of-year :quarter-of-year :year]]
   [:column       ::lib.schema.metadata/column]
   [:display-name :string]])
