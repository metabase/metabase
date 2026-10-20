(ns metabase-enterprise.dependencies.schema
  (:require
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::entity-type
  "A dependency-type keyword, or the equivalent string, which the keyword transform of every entity type column coerces."
  [:or :metabase-enterprise.dependencies.dependency-types/dependency-types :string])

(mr/def ::node
  "A dependency graph node: an entity as `[entity-type entity-id]`."
  [:tuple
   :metabase-enterprise.dependencies.dependency-types/dependency-types
   :metabase-enterprise.dependencies.dependency-types/entity-id])

(mr/def ::child-map
  "The children of dependency graph nodes, as `{node #{child-node}}`."
  [:map-of ::node [:set ::node]])

(mr/def ::visible-opts
  "The user whose readable entities a query is restricted to (`:user-id`, `:is-superuser?`, `:is-data-analyst?`), and
  whether archived entities count (`:include-archived-items`, default `:exclude`)."
  [:map {:closed true}
   [:user-id                ::lib.schema.id/user]
   [:is-superuser?          {:optional true} [:maybe :boolean]]
   [:is-data-analyst?       {:optional true} [:maybe :boolean]]
   [:include-archived-items {:optional true} [:enum :exclude :all :only]]])

(mr/def ::edge-restriction
  "The restriction of one side of a dependency edge, nil for none: the entities readable by a user (`:visible`), the
  entities that failed analysis (`:broken?`), the entities of some types (`:types`), and the entities of one type with
  some ids (`:entity-type` and `:ids`)."
  [:maybe
   [:map {:closed true}
    [:visible     {:optional true} ::visible-opts]
    [:broken?     {:optional true} :boolean]
    [:types       {:optional true} [:set ::entity-type]]
    [:entity-type {:optional true} ::entity-type]
    [:ids         {:optional true} [:sequential :metabase-enterprise.dependencies.dependency-types/entity-id]]]])

(mr/def ::pending-status
  "An entity a job is to process, with the `stale` count of its status when the job picked it, nil without a status."
  [:map {:closed true}
   [:entity_id ms/PositiveInt]
   [:stale     [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::type->ids
  "Entities as `{entity-type ids}`."
  [:map-of :metabase-enterprise.dependencies.dependency-types/dependency-types [:set ms/PositiveInt]])

(mr/def ::card-state
  "The `updated_at` and `result_metadata` of a Card, which a save or a run changes."
  [:map {:closed true}
   [:updated_at      ms/TemporalInstant]
   [:result_metadata [:maybe ::queries.schema/card.result-metadata]]])

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

(mr/def ::analysis-finding-error
  "A AnalysisFindingError as selected from the app DB: every column of `:analysis_finding_error`."
  [:merge
   ::analysis-finding-error.update
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

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
  [:merge
   ::dependency.update
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::dependency.update
  "What an update (or insert) of a Dependency accepts: every column of `:dependency` except `id`, all optional."
  [:map {:closed true}
   [:from_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:from_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:to_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:to_entity_id     {:optional true} [:maybe ms/PositiveInt]]])
