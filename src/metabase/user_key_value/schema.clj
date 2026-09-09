(ns metabase.user-key-value.schema
  "Malli schemas for the user-key-value module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::user-key-value
  "A UserKeyValue as selected from the app DB: every column of `:user_key_value`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:user_id    ::lib.schema.id/user]
   [:namespace  :string]
   [:key        :string]
   [:value      [:maybe :string]]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:expires_at [:maybe ms/TemporalInstant]]])

(mr/def ::user-key-value.update
  "What an update (or insert) of a UserKeyValue accepts: every column of `:user_key_value` except `id`, all optional."
  [:map {:closed true}
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:namespace  {:optional true} [:maybe :string]]
   [:key        {:optional true} [:maybe :string]]
   [:value      {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:expires_at {:optional true} [:maybe ms/TemporalInstant]]])
