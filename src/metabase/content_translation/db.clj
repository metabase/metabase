(ns metabase.content-translation.db
  "Application database queries for the content translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.content-translation.schema :as content-translation.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn translations-for-locale
  "The ContentTranslations for `locale`, ordered by message id."
  [locale :- :string]
  (when-not (string? locale)
    (throw (ex-info "locale must be a string" {:locale locale})))
  ;; `locale` arrives from a request parameter, so it is bound as a SQL parameter rather than
  ;; compiled into the query.
  (t2/select :model/ContentTranslation
             {:where    [:= :locale locale]
              :order-by [:msgid]}))

(mu/defn all-translations
  "Every ContentTranslation, ordered by locale and message id."
  []
  (t2/select :model/ContentTranslation {:order-by [:locale :msgid]}))

(mu/defn delete-all-translations!
  "Delete every ContentTranslation, returning the number deleted."
  []
  (t2/delete! :model/ContentTranslation))

(mu/defn insert-translations!
  "Insert the ContentTranslation `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::content-translation.schema/content-translation.update [:locale :msgid :msgstr])]]
  (transduce (map #(t2/insert! :model/ContentTranslation (vec %))) + 0 (partition-all app-db/create-partition-size rows)))
