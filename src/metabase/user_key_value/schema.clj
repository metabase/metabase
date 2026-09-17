(ns metabase.user-key-value.schema
  "Malli schemas for the user-key-value module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::user-key-value
  "A UserKeyValue as selected from the app DB: every column of `:user_key_value`."
  [:merge
   ::user-key-value.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::user-key-value.partial
  "A UserKeyValue row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::user-key-value [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::user-key-value.update
  "What an update (or insert) of a UserKeyValue accepts: every column of `:user_key_value` except `id`, all optional."
  [:map {:closed true}
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:namespace  {:optional true} [:maybe :string]]
   [:key        {:optional true} [:maybe :string]]
   [:value      {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:expires_at {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::user-key-value.column
  "A column of `user_key_value`, for the `:columns` option of the queries in [[metabase.user-key-value.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::user-key-value.update))))
