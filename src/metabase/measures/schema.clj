(ns metabase.measures.schema
  (:require
   [malli.util :as mut]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.users.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema]))

(set! *warn-on-reflection* true)

(mr/def ::definition
  "Schema for a measure's `:definition`; accepts a full MBQL query, converting legacy MBQL on decode."
  [:schema
   {:description (deferred-tru "value must be a valid MBQL query with a source table.")}
   [:and
    ::lib-be.schema/maybe-legacy-query
    [:fn
     {:error/fn (fn [_ _] (str (deferred-tru "measure definition must have a source table")))}
     #(some? (lib/primary-source-table-id %))]]])

(mr/def ::measure.definition
  "The `:definition` column of a Measure, decoded."
  ::lib-be.schema/maybe-legacy-query)

(mr/def ::measure.dimension
  "One entry of the `:dimensions` column of a Measure, decoded."
  ::lib-metric.schema/persisted-dimension)

(mr/def ::measure.dimension-mapping
  "One entry of the `:dimension_mappings` column of a Measure, decoded."
  ::lib-metric.schema/dimension-mapping)

(mr/def ::measure.name
  ms/NonBlankString)

(mr/def ::measure.update
  "What an update of a measure takes: its `:id` and the columns to change, each optional."
  [:map {:closed true}
   [:id ::lib.schema.id/measure]
   [:table_id           {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:name               {:optional true} [:maybe ::measure.name]]
   [:description        {:optional true} [:maybe :string]]
   [:archived           {:optional true} [:maybe :boolean]]
   [:definition         {:optional true} [:maybe ::measure.definition]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id          {:optional true} [:maybe :string]]
   [:dimensions         {:optional true} [:maybe [:sequential ::measure.dimension]]]
   [:dimension_mappings {:optional true} [:maybe [:sequential ::measure.dimension-mapping]]]])

(mr/def ::measure
  "A Measure as selected from the app DB: every column of `:measure`, plus `:creator` and `:table` some callers
  hydrate onto it."
  [:merge
   ::measure.update
   [:map {:closed true}
    [:id                 ms/PositiveInt]
    [:creator            {:optional true} [:maybe :metabase.users.schema/user]]
    [:table              {:optional true} [:maybe :metabase.warehouse-schema.schema/table]]]])

(mr/def ::measure.revision
  "A Measure as a Revision stores it: its tracked columns."
  [:select-keys ::measure.update [:name :description :definition :archived :table_id]])

(mr/def ::measure.create
  "What a caller gives to create a Measure, whose table follows its definition: the columns of an update without the
  `:id` and the columns the product sets, and its name and definition."
  [:merge
   (reduce mut/dissoc ::measure.update [:id :table_id :created_at :updated_at :dimensions :dimension_mappings])
   [:map {:closed true}
    [:name       ::measure.name]
    [:definition ::measure.definition]]])

(mr/def ::external-measure
  "A Measure as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::measure [:name :archived :description :entity_id :creator_id :definition]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
