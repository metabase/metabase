(ns metabase-enterprise.database-routing.schema
  "Malli schemas for the database-routing module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::database-router.user-attribute
  "The `:user_attribute` of a DatabaseRouter: the non-blank name of the user attribute it routes on."
  ms/NonBlankString)

(mr/def ::database-router
  "A DatabaseRouter as selected from the app DB: every column of `:db_router`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:database_id    {:optional true} [:maybe ::lib.schema.id/database]]
   [:user_attribute {:optional true} ::database-router.user-attribute]])

(mr/def ::database-router.update
  "The changes an update applies to each of its DatabaseRouters: the columns to set."
  [:map {:closed true}
   [:database_id    {:optional true} [:maybe ::lib.schema.id/database]]
   [:user_attribute {:optional true} ::database-router.user-attribute]])

(mr/def ::database-router.create
  "What creating a DatabaseRouter takes: the Database it routes and the user attribute it routes on."
  [:map {:closed true}
   [:database_id    :metabase.lib.schema.id/database]
   [:user_attribute ::database-router.user-attribute]])
