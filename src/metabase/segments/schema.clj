(ns metabase.segments.schema
  (:require
   [malli.util :as mut]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema]))

(mr/def ::definition
  "Schema for a segment's `:definition`; accepts a full MBQL query, converting legacy MBQL on decode."
  [:schema
   {:description (deferred-tru "value must be a valid MBQL query with a source table and filters.")}
   [:and
    ::lib-be.schema/maybe-legacy-query
    [:fn
     {:error/fn (fn [_ _] (str (deferred-tru "a segment definition must be a single-stage query with a source table and filters, and without joins, expressions, breakouts, aggregations, fields, order by, or limit")))}
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
  ::lib-be.schema/maybe-legacy-query)

(mr/def ::segment
  "A Segment as selected from the app DB: every column of `:segment`, plus `:creator` and `:table` some callers
  hydrate onto it."
  [:merge
   ::segment.columns
   [:map {:closed true}
    [:id                      ms/PositiveInt]
    [:creator                 {:optional true} [:maybe :metabase.users.schema/user]]
    [:table                   {:optional true} [:maybe :metabase.warehouse-schema.schema/table]]]])

(mr/def ::segment.columns
  "Every column of `:segment` except `id`, all optional."
  [:map {:closed true}
   [:table_id                {:optional true} [:maybe ::lib.schema.id/table]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:name                    {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:definition              {:optional true} [:maybe ::segment.definition]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:entity_id               {:optional true} [:maybe :string]]])

(mr/def ::segment.create
  "What an insert of a Segment accepts."
  (mut/select-keys (mr/schema ::segment.columns)
                   [:table_id :creator_id :name :description :archived :definition :created_at :updated_at
                    :points_of_interest :caveats :show_in_getting_started :entity_id]))

(mr/def ::segment.update
  "What an update of a Segment accepts: no immutable columns."
  (mut/select-keys (mr/schema ::segment.columns)
                   [:table_id :name :description :archived :definition :created_at :updated_at
                    :points_of_interest :caveats :show_in_getting_started]))

(mr/def ::segment.partial
  "A Segment row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::segment [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::segment.column
  "A column of `segment`, for the `:columns` option of the queries in [[metabase.segments.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::segment.columns))))
