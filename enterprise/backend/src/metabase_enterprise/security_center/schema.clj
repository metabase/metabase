(ns metabase-enterprise.security-center.schema
  "Malli schemas for the Security Center module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::advisory-id
  [:string {:min 1}])

(mr/def ::semver
  [:re #"^\d+(?:\.\d+)*$"])

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

(mr/def ::download-jar-url
  "A downloadable JAR for a given fixed version."
  [:map
   [:version ::semver]
   [:url     :string]])

(mr/def ::download-jar-urls
  [:sequential ::download-jar-url])

(mr/def ::matching-query
  "HoneySQL query keyed by dialect. nil means affects all instances.
   Stored as EDN to preserve keywords that HoneySQL requires for identifiers/operators."
  [:maybe [:map-of :keyword :map]])

(mr/def ::security-advisory.matching-query
  "The `:matching_query` column of a SecurityAdvisory, decoded."
  :map)

(mr/def ::security-advisory
  "A SecurityAdvisory as selected from the app DB: every column of `:security_advisory`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:advisory_id       :string]
   [:severity          [:or :keyword :string]]
   [:title             :string]
   [:description       :string]
   [:advisory_url      [:maybe :string]]
   [:remediation       :string]
   [:affected_versions ::affected-versions]
   [:matching_query    [:maybe ::security-advisory.matching-query]]
   [:published_at      ms/TemporalInstant]
   [:fetched_at        ms/TemporalInstant]
   [:match_status      [:or :keyword :string]]
   [:last_evaluated_at [:maybe ms/TemporalInstant]]
   [:acknowledged_by   [:maybe :int]]
   [:acknowledged_at   [:maybe ms/TemporalInstant]]
   [:last_notified_at  [:maybe ms/TemporalInstant]]
   [:updated_at        ms/TemporalInstant]
   [:download_jar_urls [:maybe ::download-jar-urls]]])

(mr/def ::security-advisory.update
  "What an update (or insert) of a SecurityAdvisory accepts: every column of `:security_advisory` except `id`, all optional."
  [:map {:closed true}
   [:advisory_id       {:optional true} [:maybe :string]]
   [:severity          {:optional true} [:maybe [:or :keyword :string]]]
   [:title             {:optional true} [:maybe :string]]
   [:description       {:optional true} [:maybe :string]]
   [:advisory_url      {:optional true} [:maybe :string]]
   [:remediation       {:optional true} [:maybe :string]]
   [:affected_versions {:optional true} [:maybe ::affected-versions]]
   [:matching_query    {:optional true} [:maybe ::security-advisory.matching-query]]
   [:published_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:fetched_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:match_status      {:optional true} [:maybe [:or :keyword :string]]]
   [:last_evaluated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:acknowledged_by   {:optional true} [:maybe :int]]
   [:acknowledged_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:last_notified_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:download_jar_urls {:optional true} [:maybe ::download-jar-urls]]])
