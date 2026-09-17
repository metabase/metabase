(ns metabase.activity-feed.schema
  "Malli schemas for the activity-feed module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::recent-views
  "A RecentViews as selected from the app DB: every column of `:recent_views`."
  [:merge
   ::recent-views.columns
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::recent-views.columns
  "Every column of `:recent_views` except `id`, all optional."
  [:map {:closed true}
   [:user_id   {:optional true} [:maybe ::lib.schema.id/user]]
   [:model     {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id  {:optional true} [:maybe :int]]
   [:timestamp {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:context   {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::recent-views.create
  "What an insert of a RecentViews accepts: every column of `:recent_views` except `id`, all optional."
  ::recent-views.columns)

(mr/def ::recent-views.partial
  "A RecentViews row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::recent-views [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::recent-views.column
  "A column of `recent_views`, for the `:columns` option of the queries in [[metabase.activity-feed.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::recent-views.columns))))
