(ns metabase.settings.schema
  "Malli schemas for the settings module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]))

(mr/def ::setting
  "A Setting as selected from the app DB: every column of `:setting`."
  [:merge
   ::setting.columns
   [:map {:closed true}]])

(mr/def ::setting.partial
  "A Setting row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::setting [:map {:closed true}]])

(mr/def ::setting.columns
  "Every column of `:setting`, all optional."
  [:map {:closed true}
   [:key            {:optional true} [:maybe :string]]
   [:value          {:optional true} [:maybe :string]]
   [:value_with_aad {:optional true} [:maybe :string]]])

(mr/def ::setting.create
  "What an insert of a Setting accepts."
  (mut/select-keys (mr/schema ::setting.columns) [:key :value :value_with_aad]))

(mr/def ::setting.update
  "What an update of a Setting accepts: no `:key`, the row's identity, which nothing ever updates."
  (mut/select-keys (mr/schema ::setting.columns) [:value :value_with_aad]))

(mr/def ::setting.column
  "A column of `setting`, for the `:columns` option of the queries in [[metabase.settings.db]]."
  (into [:enum] (mut/keys (mr/schema ::setting.columns))))
