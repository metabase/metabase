(ns metabase.bookmarks.schema
  "Malli schemas for the bookmarks module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::bookmark-ordering
  "A BookmarkOrdering as selected from the app DB: every column of `:bookmark_ordering`."
  [:merge
   ::bookmark-ordering.update
   [:map {:closed true}
    [:id       ms/PositiveInt]]])

(mr/def ::bookmark-ordering.update
  "What an update (or insert) of a BookmarkOrdering accepts: every column of `:bookmark_ordering` except `id`, all optional."
  [:map {:closed true}
   [:user_id  {:optional true} [:maybe ::lib.schema.id/user]]
   [:type     {:optional true} [:maybe [:or :keyword :string]]]
   [:item_id  {:optional true} [:maybe ms/PositiveInt]]
   [:ordering {:optional true} [:maybe :int]]])

(mr/def ::bookmark-ordering.column
  "A column of `bookmark_ordering`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::bookmark-ordering.update))))

(mr/def ::card-bookmark
  "A CardBookmark as selected from the app DB: every column of `:card_bookmark`."
  [:merge
   ::card-bookmark.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::card-bookmark.update
  "What an update (or insert) of a CardBookmark accepts: every column of `:card_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:card_id    {:optional true} [:maybe ::lib.schema.id/card]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::card-bookmark.column
  "A column of `card_bookmark`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::card-bookmark.update))))

(mr/def ::collection-bookmark
  "A CollectionBookmark as selected from the app DB: every column of `:collection_bookmark`."
  [:merge
   ::collection-bookmark.update
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::collection-bookmark.update
  "What an update (or insert) of a CollectionBookmark accepts: every column of `:collection_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::collection-bookmark.column
  "A column of `collection_bookmark`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::collection-bookmark.update))))

(mr/def ::dashboard-bookmark
  "A DashboardBookmark as selected from the app DB: every column of `:dashboard_bookmark`."
  [:merge
   ::dashboard-bookmark.update
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::dashboard-bookmark.update
  "What an update (or insert) of a DashboardBookmark accepts: every column of `:dashboard_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::dashboard-bookmark.column
  "A column of `dashboard_bookmark`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::dashboard-bookmark.update))))

(mr/def ::document-bookmark
  "A DocumentBookmark as selected from the app DB: every column of `:document_bookmark`."
  [:merge
   ::document-bookmark.update
   [:map {:closed true}
    [:id          ms/PositiveInt]]])

(mr/def ::document-bookmark.update
  "What an update (or insert) of a DocumentBookmark accepts: every column of `:document_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id     {:optional true} [:maybe ::lib.schema.id/user]]
   [:document_id {:optional true} [:maybe ms/PositiveInt]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::document-bookmark.column
  "A column of `document_bookmark`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::document-bookmark.update))))

(mr/def ::exploration-bookmark
  "A ExplorationBookmark as selected from the app DB: every column of `:exploration_bookmark`."
  [:merge
   ::exploration-bookmark.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::exploration-bookmark.update
  "What an update (or insert) of a ExplorationBookmark accepts: every column of `:exploration_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:exploration_id {:optional true} [:maybe ms/PositiveInt]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::exploration-bookmark.column
  "A column of `exploration_bookmark`, for the `:columns` option of the queries in [[metabase.bookmarks.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::exploration-bookmark.update))))
