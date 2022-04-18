(ns metabase.api.task
  "/api/task endpoints"
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.models.task-history :as task-history :refer [TaskHistory]]
            [metabase.server.middleware.offset-paging :as offset-paging]
            [metabase.task :as task]
            [toucan.db :as db]))


(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (validation/check-has-application-permission :monitoring)
  {:total  (db/count TaskHistory)
   :limit  offset-paging/*limit*
   :offset offset-paging/*offset*
   :data   (task-history/all offset-paging/*limit* offset-paging/*offset*)})

(api/defendpoint GET "/:id"
  "Get `TaskHistory` entry with ID."
  [id]
  (api/check-404 (api/read-check TaskHistory id)))

(api/defendpoint GET "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (validation/check-has-application-permission :monitoring)
  (task/scheduler-info))


(api/define-routes)
