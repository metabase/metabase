(ns metabase.bookmarks.schema
  "Malli schemas for the bookmarks module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::bookmark-ordering
  "A BookmarkOrdering as selected from the app DB: every column of `:bookmark_ordering`."
  [:map {:closed true}
   [:id       ms/PositiveInt]
   [:user_id  ::lib.schema.id/user]
   [:type     :string]
   [:item_id  ms/PositiveInt]
   [:ordering :int]])

(mr/def ::bookmark-ordering.update
  "What an update (or insert) of a BookmarkOrdering accepts: every column of `:bookmark_ordering` except `id`, all optional."
  [:map {:closed true}
   [:user_id  {:optional true} [:maybe ::lib.schema.id/user]]
   [:type     {:optional true} [:maybe :string]]
   [:item_id  {:optional true} [:maybe ms/PositiveInt]]
   [:ordering {:optional true} [:maybe :int]]])

(mr/def ::card-bookmark
  "A CardBookmark as selected from the app DB: every column of `:card_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    ::lib.schema.id/user]
   [:card_id    ::lib.schema.id/card]
   [:created_at ms/TemporalInstant]])

(mr/def ::card-bookmark.update
  "What an update (or insert) of a CardBookmark accepts: every column of `:card_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:card_id    {:optional true} [:maybe ::lib.schema.id/card]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::collection-bookmark
  "A CollectionBookmark as selected from the app DB: every column of `:collection_bookmark`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   [:user_id       ::lib.schema.id/user]
   [:collection_id ::lib.schema.id/collection]
   [:created_at    ms/TemporalInstant]])

(mr/def ::collection-bookmark.update
  "What an update (or insert) of a CollectionBookmark accepts: every column of `:collection_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::dashboard-bookmark
  "A DashboardBookmark as selected from the app DB: every column of `:dashboard_bookmark`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:user_id      ::lib.schema.id/user]
   [:dashboard_id ::lib.schema.id/dashboard]
   [:created_at   ms/TemporalInstant]])

(mr/def ::dashboard-bookmark.update
  "What an update (or insert) of a DashboardBookmark accepts: every column of `:dashboard_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::document-bookmark
  "A DocumentBookmark as selected from the app DB: every column of `:document_bookmark`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:user_id     ::lib.schema.id/user]
   [:document_id ms/PositiveInt]
   [:created_at  ms/TemporalInstant]])

(mr/def ::document-bookmark.update
  "What an update (or insert) of a DocumentBookmark accepts: every column of `:document_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id     {:optional true} [:maybe ::lib.schema.id/user]]
   [:document_id {:optional true} [:maybe ms/PositiveInt]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-bookmark
  "A ExplorationBookmark as selected from the app DB: every column of `:exploration_bookmark`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:user_id        ::lib.schema.id/user]
   [:exploration_id ms/PositiveInt]
   [:created_at     ms/TemporalInstant]])

(mr/def ::exploration-bookmark.update
  "What an update (or insert) of a ExplorationBookmark accepts: every column of `:exploration_bookmark` except `id`, all optional."
  [:map {:closed true}
   [:user_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:exploration_id {:optional true} [:maybe ms/PositiveInt]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]])
