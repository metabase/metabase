(ns metabase-enterprise.security-center.schema
  "Malli schemas for the Security Center module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::severity
  [:enum :critical :high :medium :low])

(mr/def ::match-status
  [:enum :active :resolved :not_affected :error])

(mr/def ::version-range
  "A single affected version range with inclusive min and exclusive fixed."
  [:map
   [:min   :string]
   [:fixed :string]])

(mr/def ::affected-versions
  [:sequential ::version-range])

(mr/def ::matching-query
  "HoneySQL query keyed by dialect. nil means affects all instances."
  [:maybe [:map-of :string :any]])
