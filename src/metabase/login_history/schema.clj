(ns metabase.login-history.schema
  "Malli schemas for the login-history module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::login-history
  "A LoginHistory as selected from the app DB: every column of `:login_history`, plus `:active` when selected by
  [[metabase.login-history.db/login-history-for-user]]: whether the login's session is still live."
  [:merge
   ::login-history.update
   [:map {:closed true}
    [:id                 ms/PositiveInt]
    [:active             {:optional true} :boolean]]])

(mr/def ::login-history.update
  "What an update (or insert) of a LoginHistory accepts: every column of `:login_history` except `id`, all optional."
  [:map {:closed true}
   [:timestamp          {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:session_id         {:optional true} [:maybe :string]]
   [:device_id          {:optional true} [:maybe :string]]
   [:device_description {:optional true} [:maybe :string]]
   [:ip_address         {:optional true} [:maybe :string]]])
