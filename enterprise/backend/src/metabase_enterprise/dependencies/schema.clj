(ns metabase-enterprise.dependencies.schema
  (:require
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::upstream-deps
  [:map
   [:card      {:optional true} [:set ::lib.schema.id/card]]
   [:table     {:optional true} [:set ::lib.schema.id/table]]
   [:snippet   {:optional true} [:set ::lib.schema.id/snippet]]
   [:transform {:optional true} [:set ::lib.schema.id/transform]]
   [:dashboard {:optional true} [:set ::lib.schema.id/dashboard]]
   [:document  {:optional true} [:set ::documents.schema/document.id]]
   [:sandbox   {:optional true} [:set ::lib.schema.id/sandbox]]
   [:segment   {:optional true} [:set ::lib.schema.id/segment]]])

(mr/def ::analysis-finding
  "A AnalysisFinding as selected from the app DB: every column of `:analysis_finding`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:analyzed_entity_type [:or :keyword :string]]
   [:analyzed_entity_id   ms/PositiveInt]
   [:analysis_version     :int]
   [:analyzed_at          ms/TemporalInstant]
   [:result               :boolean]
   [:stale                :boolean]])

(mr/def ::analysis-finding.update
  "What an update (or insert) of a AnalysisFinding accepts: every column of `:analysis_finding` except `id`, all optional."
  [:map {:closed true}
   [:analyzed_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:analyzed_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:analysis_version     {:optional true} [:maybe :int]]
   [:analyzed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:result               {:optional true} [:maybe :boolean]]
   [:stale                {:optional true} [:maybe :boolean]]])

(mr/def ::analysis-finding-error
  "A AnalysisFindingError as selected from the app DB: every column of `:analysis_finding_error`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:analyzed_entity_type [:or :keyword :string]]
   [:analyzed_entity_id   ms/PositiveInt]
   [:error_type           [:or :keyword :string]]
   [:error_detail         [:maybe :string]]
   [:source_entity_type   [:maybe [:or :keyword :string]]]
   [:source_entity_id     [:maybe ms/PositiveInt]]])

(mr/def ::analysis-finding-error.update
  "What an update (or insert) of a AnalysisFindingError accepts: every column of `:analysis_finding_error` except `id`, all optional."
  [:map {:closed true}
   [:analyzed_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:analyzed_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:error_type           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_detail         {:optional true} [:maybe :string]]
   [:source_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:source_entity_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::dependency
  "A Dependency as selected from the app DB: every column of `:dependency`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:from_entity_type [:or :keyword :string]]
   [:from_entity_id   ms/PositiveInt]
   [:to_entity_type   [:or :keyword :string]]
   [:to_entity_id     ms/PositiveInt]])

(mr/def ::dependency.update
  "What an update (or insert) of a Dependency accepts: every column of `:dependency` except `id`, all optional."
  [:map {:closed true}
   [:from_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:from_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:to_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:to_entity_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::dependency-status
  "A DependencyStatus as selected from the app DB: every column of `:dependency_status`."
  [:map {:closed true}
   [:id                          ms/PositiveInt]
   [:entity_type                 [:or :keyword :string]]
   [:entity_id                   ms/PositiveInt]
   [:dependency_analysis_version :int]
   [:stale                       :boolean]
   [:fail_count                  :int]
   [:next_retry_at               [:maybe ms/TemporalInstant]]
   [:terminal                    :boolean]])

(mr/def ::dependency-status.update
  "What an update (or insert) of a DependencyStatus accepts: every column of `:dependency_status` except `id`, all optional."
  [:map {:closed true}
   [:entity_type                 {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id                   {:optional true} [:maybe ms/PositiveInt]]
   [:dependency_analysis_version {:optional true} [:maybe :int]]
   [:stale                       {:optional true} [:maybe :boolean]]
   [:fail_count                  {:optional true} [:maybe :int]]
   [:next_retry_at               {:optional true} [:maybe ms/TemporalInstant]]
   [:terminal                    {:optional true} [:maybe :boolean]]])
