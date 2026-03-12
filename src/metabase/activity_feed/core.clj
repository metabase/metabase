(ns metabase.activity-feed.core
  (:require
   [metabase.activity-feed.models.recent-views]
   [potemkin :as p]))

(comment
  metabase.activity-feed.models.recent-views/keep-me)

(p/import-vars
 [metabase.activity-feed.models.recent-views
  fill-recent-view-info
  get-recents
  rv-models
  update-users-recent-views!])
