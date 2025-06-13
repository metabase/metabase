(ns metabase.content-translation.models
  "A model representing dictionary entries for translations."
  (:require
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
   ;; TODO: Restore token check here. I had to remove it because it's creating a cyclic dependency
   ;; TODO: Restore token check here. I had to remove it because it's creating a cyclic dependency
   ;; TODO: Restore token check here. I had to remove it because it's creating a cyclic dependency
   (if locale
     (t2/select :model/ContentTranslation :locale locale {:order-by [:msgid]})
     (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))))
