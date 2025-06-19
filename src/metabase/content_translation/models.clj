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


