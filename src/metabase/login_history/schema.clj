(ns metabase.login-history.schema
  "Malli schemas for the login-history module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::login-history
  "A LoginHistory as selected from the app DB: every column of `:login_history`, plus `:active` added by the model's after-select hook."
  [:merge
   ::login-history.update
   [:map {:closed true}
    [:id                 ms/PositiveInt]
    [:active             {:optional true} :boolean]]])

(mr/def ::login-history.partial
  "A LoginHistory row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::login-history [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::login-history.update
  "What an update (or insert) of a LoginHistory accepts: every column of `:login_history` except `id`, all optional."
  [:map {:closed true}
   [:timestamp          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:user_id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:session_id         {:optional true} [:maybe :string]]
   [:device_id          {:optional true} [:maybe :string]]
   [:device_description {:optional true} [:maybe :string]]
   [:ip_address         {:optional true} [:maybe :string]]])

(mr/def ::login-history.column
  "A column of `login_history`, for the `:columns` option of the queries in [[metabase.login-history.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::login-history.update))))
