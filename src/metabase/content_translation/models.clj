(ns metabase.content-translation.models
  "A model representing dictionary entries for translations."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/ContentTranslation
  (derive :metabase/model)
  (derive :hook/labelled?))

(methodical/defmethod t2/table-name :model/ContentTranslation [_model]
  :content_translation)

(defn get-translations
  "List the translations stored in the content_translation table.
  Optionally filter by locale if a locale parameter is provided."
  ([]
   (get-translations nil))
  ([locale]
   (premium-features/assert-has-feature :content-translation (tru "Content translation"))
   (if locale
     (t2/select :model/ContentTranslation :locale locale {:order-by [:msgid]})
     (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))))
