(ns metabase-enterprise.impersonation.schema
  "Malli schemas for the impersonation module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::connection-impersonation
  "A ConnectionImpersonation as selected from the app DB: every column of `:connection_impersonations`."
  [:merge
   ::connection-impersonation.columns
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::connection-impersonation.columns
  "Every column of `:connection_impersonations` except `id`, all optional."
  [:map {:closed true}
   [:db_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:attribute {:optional true} [:maybe :string]]])

(mr/def ::connection-impersonation.create
  "What an insert of a ConnectionImpersonation accepts."
  (mut/select-keys (mr/schema ::connection-impersonation.columns) [:db_id :group_id :attribute]))

(mr/def ::connection-impersonation.update
  "What an update of a ConnectionImpersonation accepts: `db_id` and `group_id` identify the row and are immutable."
  (mut/select-keys (mr/schema ::connection-impersonation.columns) [:attribute]))

(mr/def ::connection-impersonation.partial
  "A ConnectionImpersonation row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::connection-impersonation [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::connection-impersonation.column
  "A column of `:connection_impersonations`, for the `:columns` option of the queries in
  [[metabase-enterprise.impersonation.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::connection-impersonation.columns))))
