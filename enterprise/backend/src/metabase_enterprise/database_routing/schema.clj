(ns metabase-enterprise.database-routing.schema
  "Malli schemas for the database-routing module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::database-router
  "A DatabaseRouter as selected from the app DB: every column of `:db_router`."
  [:merge
   ::database-router.columns
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::database-router.columns
  "Every column of `:db_router` except `id`, all optional."
  [:map {:closed true}
   [:database_id    {:optional true} [:maybe ::lib.schema.id/database]]
   [:user_attribute {:optional true} [:maybe :string]]])

(mr/def ::database-router.create
  "What an insert of a DatabaseRouter accepts."
  (mut/select-keys (mr/schema ::database-router.columns) [:database_id :user_attribute]))

(mr/def ::database-router.update
  "What an update of a DatabaseRouter accepts: no immutable columns."
  (mut/select-keys (mr/schema ::database-router.columns) [:user_attribute]))

(mr/def ::database-router.partial
  "A DatabaseRouter row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::database-router [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::database-router.column
  "A column of `:db_router`, for the `:columns` option of the queries in [[metabase-enterprise.database-routing.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::database-router.columns))))
