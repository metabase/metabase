(ns metabase-enterprise.content-translation.db
  "Application database queries for the content-translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.content-translation.schema :as content-translation.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn delete-all-translations! :- :int
  "Delete every ContentTranslation, returning the number deleted."
  []
  (t2/delete! :model/ContentTranslation))

(mu/defn insert-translations! :- :int
  "Insert the ContentTranslation `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::content-translation.schema/content-translation.update [:locale :msgid :msgstr])]]
  (t2/insert! :model/ContentTranslation rows))
