(ns metabase.content-translation.queries
  "Application database queries for the content translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn translations-for-locale
  "The ContentTranslations for `locale`, ordered by message id."
  [locale]
  (t2/select :model/ContentTranslation :locale locale {:order-by [:msgid]}))

(defn all-translations
  "Every ContentTranslation, ordered by locale and message id."
  []
  (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))
