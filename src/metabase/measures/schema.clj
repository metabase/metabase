(ns metabase.measures.schema
  (:require
   [malli.util :as mut]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
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

(mr/def ::measure
  "A Measure as selected from the app DB: every column of `:measure`, plus `:creator` and `:table` some callers
  hydrate onto it."
  [:merge
   ::measure.columns
   [:map {:closed true}
    [:id                 ms/PositiveInt]
    [:creator            {:optional true} [:maybe :metabase.users.schema/user]]
    [:table              {:optional true} [:maybe :metabase.warehouse-schema.schema/table]]]])

(mr/def ::measure.columns
  "Every column of `:measure` except `id`, all optional."
  [:map {:closed true}
   [:table_id           {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:name               {:optional true} [:maybe :string]]
   [:description        {:optional true} [:maybe :string]]
   [:archived           {:optional true} [:maybe :boolean]]
   [:definition         {:optional true} [:maybe ::measure.definition]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:entity_id          {:optional true} [:maybe :string]]
   [:dimensions         {:optional true} [:maybe [:sequential ::measure.dimension]]]
   [:dimension_mappings {:optional true} [:maybe [:sequential ::measure.dimension-mapping]]]])

(mr/def ::measure.create
  "What an insert of a Measure accepts."
  (mut/select-keys (mr/schema ::measure.columns)
                   [:table_id :creator_id :name :description :archived :definition :created_at :updated_at
                    :entity_id :dimensions :dimension_mappings]))

(mr/def ::measure.update
  "What an update of a Measure accepts: no immutable columns."
  (mut/select-keys (mr/schema ::measure.columns)
                   [:table_id :name :description :archived :definition :created_at :updated_at
                    :dimensions :dimension_mappings]))

(mr/def ::measure.partial
  "A Measure row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::measure [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::measure.column
  "A column of `measure`, for the `:columns` option of the queries in [[metabase.measures.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::measure.columns))))
