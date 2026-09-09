(ns metabase.segments.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::definition
  "Schema for a segment's `:definition`; accepts a full MBQL query, converting legacy MBQL on decode."
  [:schema
   {:description (deferred-tru "value must be a valid MBQL query with a source table and filters.")}
   [:and
    ::lib-be.schema/maybe-legacy-query
    [:fn
     {:error/message (deferred-tru "a segment definition must be a single-stage query with a source table and filters, and without joins, expressions, breakouts, aggregations, fields, order by, or limit")}
     (fn [query]
       (and (= (lib/stage-count query) 1)
            (some? (lib/primary-source-table-id query))
            (seq (lib/filters query))
            (empty? (lib/joins query))
            (empty? (lib/expressions query))
            (empty? (lib/breakouts query))
            (empty? (lib/aggregations query))
            (empty? (lib/order-bys query))
            (nil? (lib/current-limit query))))]]])

(mr/def ::segment.definition
  "The `:definition` column of a Segment, decoded."
  :map)

(mr/def ::segment
  "A Segment as selected from the app DB: every column of `:segment`."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:table_id                ::lib.schema.id/table]
   [:creator_id              ::lib.schema.id/user]
   [:name                    :string]
   [:description             [:maybe :string]]
   [:archived                :boolean]
   [:definition              [:maybe ::segment.definition]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:points_of_interest      [:maybe :string]]
   [:caveats                 [:maybe :string]]
   [:show_in_getting_started :boolean]
   [:entity_id               :string]
   [:worktree_id             [:maybe ::lib.schema.id/worktree]]])

(mr/def ::segment.update
  "What an update (or insert) of a Segment accepts: every column of `:segment` except `id`, all optional."
  [:map {:closed true}
   [:table_id                {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:name                    {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:definition              {:optional true} [:maybe ::segment.definition]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:entity_id               {:optional true} [:maybe :string]]
   [:worktree_id             {:optional true} [:maybe ::lib.schema.id/worktree]]])
