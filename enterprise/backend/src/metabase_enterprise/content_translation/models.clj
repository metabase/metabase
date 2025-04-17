(def ContentTranslationModel
  "Model for dictionary entries containing translations"
  [:enum "locale" "msgid" "translation"])

(ns metabase-enterprise.content-translation.models
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
   (let [base-query {:select [:*]
                     :from [[(t2/table-name :model/ContentTranslation) :t]]}
         query (if locale
                 (assoc base-query :where [:= :t/locale locale])
                 base-query)]
     (t2/query query))))
