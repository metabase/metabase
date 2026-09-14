(ns metabase.content-translation.db
  "Application database queries for the content translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  This namespace has adopted [[metabase.app-db.value-guard]]: `locale` reaches the query from a request parameter, so it
  is coerced at the boundary and the query is checked before it runs."
  (:require
   [metabase.app-db.value-guard :as value-guard]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn translations-for-locale
  "The ContentTranslations for `locale`, ordered by message id."
  [locale :- :string]
  (t2/select :model/ContentTranslation
             (value-guard/checked {:where    [:= :locale (value-guard/str* locale)]
                                   :order-by [:msgid]})))

(mu/defn all-translations
  "Every ContentTranslation, ordered by locale and message id."
  []
  (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))
