(ns metabase.content-translation.db
  "Application database queries for the content translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  This namespace is listed in [[metabase.app-db.value-guard/enforcing-namespace-prefixes]], so every query it issues is
  checked: a value slot holding anything that could compile as SQL fails the query. `locale` reaches the query from a
  request parameter, so it is coerced where it enters."
  (:require
   [metabase.app-db.value-guard :as value-guard]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn translations-for-locale
  "The ContentTranslations for `locale`, ordered by message id."
  [locale :- :string]
  (t2/select :model/ContentTranslation
             :locale (value-guard/str* locale)
             {:order-by [:msgid]}))

(mu/defn all-translations
  "Every ContentTranslation, ordered by locale and message id."
  []
  (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))

(defn ^:private ^:no-doc unchecked-value-query-for-tests
  "A query with a bare keyword in a value slot, which `honeysql-guard` permits and the value guard
  does not. Exists so a test can prove the value guard is actually scoped to this namespace; there
  is no other way to observe the difference from outside it."
  []
  (t2/select :model/ContentTranslation {:where [:= :locale :not-a-value]}))
