(ns metabase-enterprise.database-routing.schema
  "Malli schemas for the database-routing module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::database-router.user-attribute
  "The `:user_attribute` of a DatabaseRouter: the non-blank name of the user attribute it routes on."
  ms/NonBlankString)

(mr/def ::database-router
  "A DatabaseRouter as selected from the app DB: every column of `:db_router`."
  [:map {:closed true}
   [:id                       ms/PositiveInt]
   [:database_id              {:optional true} ::lib.schema.id/database]
   [:user_attribute           {:optional true} ::database-router.user-attribute]
   [:anonymous_access_granted {:optional true} :boolean]])

(mr/def ::database-router.update
  "What an update of a DatabaseRouter takes: its `:id` and the columns to change, each optional."
  [:map {:closed true}
   [:id                       ms/PositiveInt]
   [:database_id              {:optional true} ::lib.schema.id/database]
   [:user_attribute           {:optional true} ::database-router.user-attribute]
   [:anonymous_access_granted {:optional true} :boolean]])

(mr/def ::database-router.create
  "What creating a DatabaseRouter takes: the columns of an update without the `:id`, and the Database it routes and
  the user attribute it routes on."
  [:merge
   (mut/dissoc ::database-router.update :id)
   [:map
    [:database_id    ::lib.schema.id/database]
    [:user_attribute ::database-router.user-attribute]]])
