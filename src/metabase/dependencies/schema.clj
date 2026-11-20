(ns metabase.dependencies.schema
  "The schemas of what the dependencies specs of the models return, and of the users whose readable entities queries
  are restricted to."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::dependencies
  "Entities as `{entity-type #{entity-id}}`, such as the dependencies of a row."
  [:map-of :keyword [:set ms/PositiveInt]])

(mr/def ::visible-opts
  "The user whose readable entities a query is restricted to (`:user-id`, `:is-superuser?`, `:is-data-analyst?`), and
  whether archived entities count (`:include-archived-items`, default `:exclude`)."
  [:map {:closed true}
   [:user-id                ::lib.schema.id/user]
   [:is-superuser?          {:optional true} [:maybe :boolean]]
   [:is-data-analyst?       {:optional true} [:maybe :boolean]]
   [:include-archived-items {:optional true} [:enum :exclude :all :only]]])
