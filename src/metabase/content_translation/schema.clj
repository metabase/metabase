(ns metabase.content-translation.schema
  "Malli schemas for the content-translation module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::content-translation
  "A ContentTranslation as selected from the app DB: every column of `:content_translation`."
  [:map {:closed true}
   [:id     ms/PositiveInt]
   [:locale :string]
   [:msgid  [:or :string :map sequential?]]
   [:msgstr [:or :string :map sequential?]]])

(mr/def ::content-translation.update
  "What an update (or insert) of a ContentTranslation accepts: every column of `:content_translation` except `id`, all optional."
  [:map {:closed true}
   [:locale {:optional true} [:maybe :string]]
   [:msgid  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:msgstr {:optional true} [:maybe [:or :string :map sequential?]]]])
