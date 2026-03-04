(ns metabase.lib.schema.settings
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression.temporal :as lib.schema.expression.temporal]
   [metabase.util.malli.registry :as mr]))

(mr/def ::settings
  "Options that tweak the behavior of the query processor."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:report-timezone
    {:optional    true
     :description "The timezone the query should be ran in, overriding the default report timezone for the instance."}
    [:ref ::lib.schema.expression.temporal/timezone-id]]
   [:include-sensitive-fields
    {:optional    true
     :description "Whether to include fields with visibility_type :sensitive when fetching query metadata."}
    :boolean]])
