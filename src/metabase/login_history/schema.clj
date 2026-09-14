(ns metabase.login-history.schema
  "Malli schemas for the login-history module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::login-history
  "A LoginHistory as selected from the app DB: every column of `:login_history`, plus `:active` added by the model's after-select hook."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:timestamp          ms/TemporalInstant]
   [:user_id            ::lib.schema.id/user]
   [:session_id         {:optional true} [:maybe :string]]
   [:device_id          :string]
   [:device_description :string]
   [:ip_address         :string]
   [:active             {:optional true} :boolean]])

(mr/def ::login-history.update
  "What an update (or insert) of a LoginHistory accepts: every column of `:login_history` except `id`, all optional."
  [:map {:closed true}
   [:timestamp          {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:session_id         {:optional true} [:maybe :string]]
   [:device_id          {:optional true} [:maybe :string]]
   [:device_description {:optional true} [:maybe :string]]
   [:ip_address         {:optional true} [:maybe :string]]])
