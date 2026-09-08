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
     {:error/message (deferred-tru "measure definition must have a source table")}
     #(some? (lib/primary-source-table-id %))]]])

(mr/def ::measure
  "A Measure as selected from the app DB: every column of `:measure`."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:table_id           ::lib.schema.id/table]
   [:creator_id         ::lib.schema.id/user]
   [:name               :string]
   [:description        [:maybe [:or :string :map sequential?]]]
   [:archived           :boolean]
   [:definition         [:or :string :map sequential?]]
   [:created_at         ms/TemporalInstant]
   [:updated_at         ms/TemporalInstant]
   [:entity_id          :string]
   [:dimensions         [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings [:maybe [:or :string :map sequential?]]]])

(mr/def ::measure.update
  "What an update (or insert) of a Measure accepts: every column of `:measure` except `id`, all optional."
  [:map {:closed true}
   [:table_id           {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:name               {:optional true} [:maybe :string]]
   [:description        {:optional true} [:maybe [:or :string :map sequential?]]]
   [:archived           {:optional true} [:maybe :boolean]]
   [:definition         {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id          {:optional true} [:maybe :string]]
   [:dimensions         {:optional true} [:maybe [:or :string :map sequential?]]]
   [:dimension_mappings {:optional true} [:maybe [:or :string :map sequential?]]]])
