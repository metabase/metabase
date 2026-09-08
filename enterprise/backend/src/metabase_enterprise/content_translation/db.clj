(ns metabase-enterprise.content-translation.db
  "Application database queries for the content-translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn delete-all-translations!
  "Delete every ContentTranslation."
  []
  (t2/delete! :model/ContentTranslation))

(defn insert-translations!
  "Insert the ContentTranslation `rows`."
  [rows]
  (t2/insert! :model/ContentTranslation rows))
