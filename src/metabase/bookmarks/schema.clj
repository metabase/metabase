(ns metabase.bookmarks.schema
  "Malli schemas for the bookmarks module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::bookmark-ordering.type
  [:enum "card" "dashboard" "collection" "document" "exploration"])

(mr/def ::bookmark-ordering
  "A BookmarkOrdering as selected from the app DB: every column of `:bookmark_ordering`."
  [:map {:closed true}
   [:id       ms/PositiveInt]
   [:user_id  {:optional true} ::lib.schema.id/user]
   [:type     {:optional true} ::bookmark-ordering.type]
   [:item_id  {:optional true} ms/PositiveInt]
   [:ordering {:optional true} :int]])

(mr/def ::bookmark-ordering.create
  "What a caller gives to create a BookmarkOrdering."
  [:map {:closed true}
   [:user_id  ::lib.schema.id/user]
   [:type     ::bookmark-ordering.type]
   [:item_id  ms/PositiveInt]
   [:ordering :int]])

(mr/def ::bookmark.create
  "What a caller gives to bookmark an item: the bookmark type of the item, its id and the User."
  [:map {:closed true}
   [:type    :string]
   [:item_id ms/PositiveInt]
   [:user_id ::lib.schema.id/user]])

(mr/def ::card-bookmark
  "A CardBookmark as selected from the app DB: every column of `:card_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:card_id {:optional true} ::lib.schema.id/card]
   [:created_at {:optional true} ms/TemporalInstant]])

(mr/def ::card-bookmark.create
  "What a caller gives to create a CardBookmark."
  [:map {:closed true}
   [:user_id ::lib.schema.id/user]
   [:card_id ::lib.schema.id/card]])

(mr/def ::collection-bookmark
  "A CollectionBookmark as selected from the app DB: every column of `:collection_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:collection_id {:optional true} ::lib.schema.id/collection]
   [:created_at {:optional true} ms/TemporalInstant]])

(mr/def ::collection-bookmark.create
  "What a caller gives to create a CollectionBookmark."
  [:map {:closed true}
   [:user_id ::lib.schema.id/user]
   [:collection_id ::lib.schema.id/collection]])

(mr/def ::dashboard-bookmark
  "A DashboardBookmark as selected from the app DB: every column of `:dashboard_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:dashboard_id {:optional true} ::lib.schema.id/dashboard]
   [:created_at {:optional true} ms/TemporalInstant]])

(mr/def ::dashboard-bookmark.create
  "What a caller gives to create a DashboardBookmark."
  [:map {:closed true}
   [:user_id ::lib.schema.id/user]
   [:dashboard_id ::lib.schema.id/dashboard]])

(mr/def ::document-bookmark
  "A DocumentBookmark as selected from the app DB: every column of `:document_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:document_id {:optional true} ms/PositiveInt]
   [:created_at {:optional true} ms/TemporalInstant]])

(mr/def ::document-bookmark.create
  "What a caller gives to create a DocumentBookmark."
  [:map {:closed true}
   [:user_id ::lib.schema.id/user]
   [:document_id ms/PositiveInt]])

(mr/def ::exploration-bookmark
  "A ExplorationBookmark as selected from the app DB: every column of `:exploration_bookmark`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:exploration_id {:optional true} ms/PositiveInt]
   [:created_at {:optional true} ms/TemporalInstant]])

(mr/def ::exploration-bookmark.create
  "What a caller gives to create a ExplorationBookmark."
  [:map {:closed true}
   [:user_id ::lib.schema.id/user]
   [:exploration_id ms/PositiveInt]])
