(ns metabase-enterprise.security-center.schema
  "Malli schemas for the Security Center module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::advisory-id
  [:re #"^SC-\d{4}-\d{3,}$"])

(mr/def ::semver
  [:re #"^\d+\.\d+\.\d+$"])

(mr/def ::severity
  [:enum :critical :high :medium :low])

(mr/def ::match-status
  [:enum :unknown :active :resolved :not_affected :error])

(mr/def ::version-range
  "A single affected version range with inclusive min and exclusive fixed."
  [:map
   [:min   ::semver]
   [:fixed ::semver]])

(mr/def ::affected-versions
  [:sequential ::version-range])

(mr/def ::matching-query
  "HoneySQL query keyed by dialect. nil means affects all instances.
   Stored as EDN to preserve keywords that HoneySQL requires for identifiers/operators."
  [:maybe [:map-of :keyword :map]])
