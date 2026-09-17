(ns metabase-enterprise.dependencies.schema
  (:require
   [malli.util :as mut]
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
  "An AnalysisFinding as selected from the app DB: every column of `:analysis_finding`."
  [:merge
   ::analysis-finding.columns
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::analysis-finding.columns
  "Every column of `:analysis_finding` except `id`, all optional."
  [:map {:closed true}
   [:analyzed_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:analyzed_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:analysis_version     {:optional true} [:maybe :int]]
   [:analyzed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:result               {:optional true} [:maybe :boolean]]
   [:stale                {:optional true} [:maybe :boolean]]])

(mr/def ::analysis-finding.create
  "What an insert of a AnalysisFinding accepts."
  (mut/select-keys (mr/schema ::analysis-finding.columns)
                   [:analyzed_entity_type :analyzed_entity_id :analysis_version :analyzed_at :result :stale]))

(mr/def ::analysis-finding.update
  "What an update of a AnalysisFinding accepts: `:analyzed_entity_type` and `:analyzed_entity_id` (the analyzed
  entity's identity) do not change."
  (mut/select-keys (mr/schema ::analysis-finding.columns) [:analysis_version :analyzed_at :result :stale]))

(mr/def ::analysis-finding.partial
  "An AnalysisFinding row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::analysis-finding [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::analysis-finding.column
  "A column of `analysis_finding`, for the `:columns` option of the queries in
  [[metabase-enterprise.dependencies.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::analysis-finding.columns))))

(mr/def ::analysis-finding-error
  "An AnalysisFindingError as selected from the app DB: every column of `:analysis_finding_error`."
  [:merge
   ::analysis-finding-error.columns
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::analysis-finding-error.columns
  "Every column of `:analysis_finding_error` except `id`, all optional."
  [:map {:closed true}
   [:analyzed_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:analyzed_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:error_type           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_detail         {:optional true} [:maybe :string]]
   [:source_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:source_entity_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::analysis-finding-error.create
  "What an insert of a AnalysisFindingError accepts."
  (mut/select-keys (mr/schema ::analysis-finding-error.columns)
                   [:analyzed_entity_type :analyzed_entity_id :error_type :error_detail
                    :source_entity_type :source_entity_id]))

(mr/def ::analysis-finding-error.partial
  "An AnalysisFindingError row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::analysis-finding-error [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::analysis-finding-error.column
  "A column of `analysis_finding_error`, for the `:columns` option of the queries in
  [[metabase-enterprise.dependencies.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::analysis-finding-error.columns))))

(mr/def ::dependency
  "A Dependency as selected from the app DB: every column of `:dependency`."
  [:merge
   ::dependency.columns
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::dependency.columns
  "Every column of `:dependency` except `id`, all optional."
  [:map {:closed true}
   [:from_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:from_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:to_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:to_entity_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::dependency.create
  "What an insert of a Dependency accepts."
  (mut/select-keys (mr/schema ::dependency.columns) [:from_entity_type :from_entity_id :to_entity_type :to_entity_id]))

(mr/def ::dependency.update
  "What an update of a Dependency accepts: `:from_entity_type` and `:from_entity_id` (the owning entity's identity)
  do not change."
  (mut/select-keys (mr/schema ::dependency.columns) [:to_entity_type :to_entity_id]))

(mr/def ::dependency.partial
  "A Dependency row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::dependency [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::dependency.column
  "A column of `dependency`, for the `:columns` option of the queries in [[metabase-enterprise.dependencies.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::dependency.columns))))

(mr/def ::dependency-status
  "A DependencyStatus as selected from the app DB: every column of `:dependency_status`."
  [:merge
   ::dependency-status.columns
   [:map {:closed true}
    [:id                          ms/PositiveInt]]])

(mr/def ::dependency-status.columns
  "Every column of `:dependency_status` except `id`, all optional."
  [:map {:closed true}
   [:entity_type                 {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id                   {:optional true} [:maybe ms/PositiveInt]]
   [:dependency_analysis_version {:optional true} [:maybe :int]]
   [:stale                       {:optional true} [:maybe :boolean]]
   [:fail_count                  {:optional true} [:maybe :int]]
   [:next_retry_at               {:optional true} [:maybe ms/TemporalInstant]]
   [:terminal                    {:optional true} [:maybe :boolean]]])

(mr/def ::dependency-status.create
  "What an insert of a DependencyStatus accepts."
  (mut/select-keys (mr/schema ::dependency-status.columns)
                   [:entity_type :entity_id :dependency_analysis_version :stale :fail_count :next_retry_at :terminal]))

(mr/def ::dependency-status.update
  "What an update of a DependencyStatus accepts: `:entity_type` and `:entity_id` (the tracked entity's identity)
  do not change."
  (mut/select-keys (mr/schema ::dependency-status.columns)
                   [:dependency_analysis_version :stale :fail_count :next_retry_at :terminal]))

(mr/def ::dependency-status.partial
  "A DependencyStatus row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::dependency-status [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::dependency-status.column
  "A column of `dependency_status`, for the `:columns` option of the queries in
  [[metabase-enterprise.dependencies.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::dependency-status.columns))))
