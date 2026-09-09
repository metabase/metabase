(ns metabase.activity-feed.schema
  "Malli schemas for the activity-feed module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::recent-views
  "A RecentViews as selected from the app DB: every column of `:recent_views`."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:user_id   ::lib.schema.id/user]
   [:model     :string]
   [:model_id  [:maybe :int]]
   [:timestamp ms/TemporalInstant]
   [:context   [:or :keyword :string]]])

(mr/def ::recent-views.update
  "What an update (or insert) of a RecentViews accepts: every column of `:recent_views` except `id`, all optional."
  [:map {:closed true}
   [:user_id   {:optional true} [:maybe ::lib.schema.id/user]]
   [:model     {:optional true} [:maybe :string]]
   [:model_id  {:optional true} [:maybe :int]]
   [:timestamp {:optional true} [:maybe ms/TemporalInstant]]
   [:context   {:optional true} [:maybe [:or :keyword :string]]]])
