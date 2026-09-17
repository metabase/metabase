(ns metabase.content-translation.schema
  "Malli schemas for the content-translation module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::content-translation
  "A ContentTranslation as selected from the app DB: every column of `:content_translation`."
  [:merge
   ::content-translation.update
   [:map {:closed true}
    [:id     ms/PositiveInt]]])

(mr/def ::content-translation.partial
  "A ContentTranslation row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::content-translation [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::content-translation.update
  "What an update (or insert) of a ContentTranslation accepts: every column of `:content_translation` except `id`, all optional."
  [:map {:closed true}
   [:locale {:optional true} [:maybe :string]]
   [:msgid  {:optional true} [:maybe :string]]
   [:msgstr {:optional true} [:maybe :string]]])

(mr/def ::content-translation.column
  "A column of `content_translation`, for the `:columns` option of the queries in
  [[metabase.content-translation.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::content-translation.update))))
