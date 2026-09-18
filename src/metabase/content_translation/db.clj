(ns metabase.content-translation.db
  "Application database queries for the content translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn translations-for-locale
  "The ContentTranslations for `locale`, ordered by message id."
  [locale :- :string]
  ;; `locale` arrives from a request parameter, so it is bound as a SQL parameter rather than
  ;; compiled into the query.
  (t2/select :model/ContentTranslation
             {:where    [:= :locale [:auto/param locale]]
              :order-by [:msgid]}))

(mu/defn all-translations
  "Every ContentTranslation, ordered by locale and message id."
  []
  (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))
