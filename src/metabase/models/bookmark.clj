(ns metabase.models.bookmark
  (:require [toucan.models :as models]))

(models/defmodel CardBookmark :card_bookmark)
(models/defmodel DashboardBookmark :dashboard_bookmark)
(models/defmodel CollectionBookmark :collection_bookmark)

(defn bookmarks-for-user
  "Get all bookmarks for a user"
  [id]
  ;; todo
  )
