(ns metabase.timeline.schema
  "Malli schemas for the timeline module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::timeline
  "A Timeline as selected from the app DB: every column of `:timeline`."
  [:merge
   ::timeline.update
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::timeline.update
  "What an update (or insert) of a Timeline accepts: every column of `:timeline` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe :string]]
   [:icon          {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:default       {:optional true} [:maybe :boolean]]
   [:entity_id     {:optional true} [:maybe :string]]])

(mr/def ::timeline-event
  "A TimelineEvent as selected from the app DB: every column of `:timeline_event`."
  [:merge
   ::timeline-event.update
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::timeline-event.update
  "What an update (or insert) of a TimelineEvent accepts: every column of `:timeline_event` except `id`, all optional."
  [:map {:closed true}
   [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
   [:name         {:optional true} [:maybe :string]]
   [:description  {:optional true} [:maybe :string]]
   [:timestamp    {:optional true} [:maybe ms/TemporalInstant]]
   [:time_matters {:optional true} [:maybe :boolean]]
   [:timezone     {:optional true} [:maybe :string]]
   [:icon         {:optional true} [:maybe :string]]
   [:archived     {:optional true} [:maybe :boolean]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
