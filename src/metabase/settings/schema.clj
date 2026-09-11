(ns metabase.settings.schema
  "Malli schemas for the settings module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::setting
  "A Setting as selected from the app DB: every column of `:setting`."
  [:map {:closed true}
   [:key            :string]
   [:value          :string]
   [:value_with_aad [:maybe :string]]])

(mr/def ::setting.update
  "What an update (or insert) of a Setting accepts: every column of `:setting` except `id`, all optional."
  [:map {:closed true}
   [:key            {:optional true} [:maybe :string]]
   [:value          {:optional true} [:maybe :string]]
   [:value_with_aad {:optional true} [:maybe :string]]])
