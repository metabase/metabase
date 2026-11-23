(ns metabase.timeline.schema
  "Malli schemas for the timeline module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::name
  ms/NonBlankString)

(mr/def ::icon
  [:enum "star" "cake" "mail" "mail_at" "warning" "bell" "cloud" "info" "note" "event"])

(mr/def ::time-matters
  :boolean)

(mr/def ::timeline
  "A Timeline as selected from the app DB: every column of `:timeline`."
  [:merge
   ::timeline.update
   [:map {:closed true}
    [:collection    {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]]])

(mr/def ::timeline.create
  "What a caller gives to create a Timeline."
  [:map {:closed true}
   [:name              ::name]
   [:description       {:optional true} [:maybe :string]]
   [:icon              {:optional true} ::icon]
   [:collection_id     {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived          {:optional true} [:maybe :boolean]]
   [:archived_directly {:optional true} [:maybe :boolean]]
   [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:default           {:optional true} [:maybe :boolean]]
   [:entity_id         {:optional true} [:maybe :string]]])

(mr/def ::timeline.update
  "A Timeline by its `id` with the columns to change: those of `::timeline.create`, and the columns the product sets."
  [:merge
   ::timeline.create
   [:map {:closed true}
    [:id         ms/PositiveInt]
    [:name       {:optional true} ::name]
    [:created_at {:optional true} [:maybe ms/TemporalInstant]]
    [:updated_at {:optional true} [:maybe ms/TemporalInstant]]]])

(mr/def ::timeline-event
  "A TimelineEvent as selected from the app DB: every column of `:timeline_event`."
  [:merge
   ::timeline-event.update
   [:map {:closed true}]])

(mr/def ::timeline-event.create
  "What a caller gives to create a TimelineEvent."
  [:map {:closed true}
   [:timeline_id  ms/PositiveInt]
   [:name         ::name]
   [:description  {:optional true} [:maybe :string]]
   [:timestamp    ms/TemporalInstant]
   [:time_matters {:optional true} ::time-matters]
   [:timezone     {:optional true} [:maybe :string]]
   [:icon         {:optional true} ::icon]
   [:archived     {:optional true} [:maybe :boolean]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]
   [:entity_id    {:optional true} [:maybe :string]]])

(mr/def ::timeline-event.update
  "A TimelineEvent by its `id` with the columns to change: those of `::timeline-event.create`, and the columns the
  product sets."
  [:merge
   ::timeline-event.create
   [:map {:closed true}
    [:id           ms/PositiveInt]
    [:timeline_id  {:optional true} ms/PositiveInt]
    [:name         {:optional true} ::name]
    [:timestamp    {:optional true} ms/TemporalInstant]
    [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
    [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]]])

(mr/def ::external-timeline
  "A Timeline as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::timeline [:archived :archived_directly :default :description :entity_id :icon :name :collection_id :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:events {:optional true} [:maybe [:sequential [:ref ::external-timeline-event]]]]]]])

(mr/def ::external-timeline-event
  "A TimelineEvent as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::timeline-event [:archived :description :entity_id :icon :name :time_matters :timezone :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:timestamp {:optional true} [:maybe ::models.schema/external-date]]]]])

(mr/def ::write-opts
  "The options of a write function of Timelines or their events: `:writer`, who writes when it matters, and the context
  of its events."
  [:maybe [:map {:closed true}
           [:writer  {:optional true} [:enum :import]]
           [:context {:optional true} [:maybe :metabase.events.schema/context]]]])
