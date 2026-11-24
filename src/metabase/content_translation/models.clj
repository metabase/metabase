(ns metabase.content-translation.models
  "A model representing dictionary entries for translations."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.content-translation.db :as content-translation.db]
   [metabase.content-translation.schema :as content-translation.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
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
     (content-translation.db/translations-for-locale locale)
     (content-translation.db/all-translations))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn delete-all-content-translations!
  "Delete every ContentTranslation, returning the number deleted."
  []
  (content-translation.db/delete-all-translations!))

(mu/defn create-content-translations!
  "Insert the ContentTranslation `rows`, returning the number inserted."
  [rows :- [:sequential ::content-translation.schema/content-translation.create]]
  (content-translation.db/insert-translations! rows))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ContentTranslation [_model]
  {:skip? true})
