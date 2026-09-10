(ns metabase.measures.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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
  :map)

(mr/def ::measure.dimension
  "One entry of the `:dimensions` column of a Measure, decoded."
  :map)

(mr/def ::measure.dimension-mapping
  "One entry of the `:dimension_mappings` column of a Measure, decoded."
  :map)

(mr/def ::measure
  "A Measure as selected from the app DB: every column of `:measure`."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:table_id           ::lib.schema.id/table]
   [:creator_id         ::lib.schema.id/user]
   [:name               :string]
   [:description        [:maybe :string]]
   [:archived           :boolean]
   [:definition         ::measure.definition]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:entity_id          :string]
   [:dimensions         [:maybe [:sequential ::measure.dimension]]]
   [:dimension_mappings [:maybe [:sequential ::measure.dimension-mapping]]]])

(mr/def ::measure.update
  "What an update (or insert) of a Measure accepts: every column of `:measure` except `id`, all optional."
  [:map {:closed true}
   [:table_id           {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:name               {:optional true} [:maybe :string]]
   [:description        {:optional true} [:maybe :string]]
   [:archived           {:optional true} [:maybe :boolean]]
   [:definition         {:optional true} [:maybe ::measure.definition]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id          {:optional true} [:maybe :string]]
   [:dimensions         {:optional true} [:maybe [:sequential ::measure.dimension]]]
   [:dimension_mappings {:optional true} [:maybe [:sequential ::measure.dimension-mapping]]]])
