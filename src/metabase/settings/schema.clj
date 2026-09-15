(ns metabase.settings.schema
  "Malli schemas for the settings module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::setting
  "A Setting as selected from the app DB: every column of `:setting`."
  [:merge
   ::setting.update
   [:map {:closed true, :probe/id "src/metabase/settings/schema.clj:10"}]])

(mr/def ::setting.update
  "What an update (or insert) of a Setting accepts: every column of `:setting` except `id`, all optional."
  [:map {:closed true}
   [:key            {:optional true} [:maybe :string]]
   [:value          {:optional true} [:maybe :string]]
   [:value_with_aad {:optional true} [:maybe :string]]])
