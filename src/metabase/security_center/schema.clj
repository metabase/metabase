(ns metabase.security-center.schema
  "Malli schemas for the Security Center module."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
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
  "A single affected version range with inclusive min and exclusive fixed, whose keys are the MetaStore's."
  [:map {:closed false, ::mr/deliberately-open true, :description "MetaStore affected version range"}
   [:min   ::semver]
   [:fixed ::semver]])

(mr/def ::affected-versions
  [:sequential ::version-range])

(mr/def ::download-jar-url
  "A downloadable JAR for a given fixed version, whose keys are the MetaStore's."
  [:map {:closed false, ::mr/deliberately-open true, :description "MetaStore downloadable JAR"}
   [:version ::semver]
   [:url     :string]])

(mr/def ::download-jar-urls
  [:sequential ::download-jar-url])

(mr/def ::driver
  "The app DB an advisory's `:matching_query` is written for. `:default` is the fallback used when there is no query
  for the app DB in use."
  [:enum :default :h2 :mysql :postgres])

(mr/def ::honeysql-query
  "A HoneySQL 2 query map, as EDN keyed by its top-level clause keywords."
  [:map {:closed true}
   [:with        {:optional true} [:sequential [:tuple :keyword [:ref ::honeysql-query]]]]
   [:select      {:optional true} [:sequential ::h2x/expr]]
   [:delete-from {:optional true} ::h2x/expr]
   [:from     {:optional true} [:sequential [:or ::h2x/expr [:ref ::honeysql-query]]]]
   [:join     {:optional true} [:sequential [:or ::h2x/expr [:ref ::honeysql-query]]]]
   [:where    {:optional true} ::h2x/expr]
   [:group-by {:optional true} [:sequential ::h2x/expr]]
   [:having   {:optional true} ::h2x/expr]
   [:order-by {:optional true} [:sequential ::h2x/expr]]
   [:limit    {:optional true} ::h2x/expr]
   [:offset   {:optional true} ::h2x/expr]])

(mr/def ::matching-query
  "HoneySQL query keyed by dialect. nil means affects all instances.
   Stored as EDN to preserve keywords that HoneySQL requires for identifiers/operators."
  [:maybe [:map {:closed true}
           [:default  {:optional true} ::honeysql-query]
           [:h2       {:optional true} ::honeysql-query]
           [:mysql    {:optional true} ::honeysql-query]
           [:postgres {:optional true} ::honeysql-query]]])

(mr/def ::security-advisory.matching-query
  "The `:matching_query` column of a SecurityAdvisory, decoded."
  ::matching-query)

(mr/def ::security-advisory
  "A SecurityAdvisory as selected from the app DB: every column of `:security_advisory`."
  [:merge
   ::security-advisory.update
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

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
