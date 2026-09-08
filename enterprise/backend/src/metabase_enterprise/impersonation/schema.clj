(ns metabase-enterprise.impersonation.schema
  "Malli schemas for the impersonation module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::connection-impersonation
  "A ConnectionImpersonation as selected from the app DB: every column of `:connection_impersonations`."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:db_id     ::lib.schema.id/database]
   [:group_id  ms/PositiveInt]
   [:attribute [:maybe [:or :string :map sequential?]]]])

(mr/def ::connection-impersonation.update
  "What an update (or insert) of a ConnectionImpersonation accepts: every column of `:connection_impersonations` except `id`, all optional."
  [:map {:closed true}
   [:db_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:attribute {:optional true} [:maybe [:or :string :map sequential?]]]])
