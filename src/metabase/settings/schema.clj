(ns metabase.settings.schema
  "Malli schemas for the settings module."
  (:require
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::setting
  "A Setting as selected from the app DB: every column of `:setting`."
  [:merge
   ::setting.update
   [:map {:closed true}]])

(mr/def ::setting.update
  "What an update (or insert) of a Setting accepts: every column of `:setting` except `id`, all optional."
  [:map {:closed true}
   [:key            {:optional true} [:maybe :string]]
   [:value          {:optional true} [:maybe :string]]
   [:value_with_aad {:optional true} [:maybe :string]]])

(mr/def ::external-setting
  "A Setting as serialization writes it: its key, and its value as a string."
  [:map {:closed true}
   [:serdes/meta {:optional true} ::models.schema/external-meta]
   [:key :string]
   [:value {:optional true} [:maybe :string]]])
