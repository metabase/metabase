(ns metabase.api.task
  "/api/task endpoints"
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.task-history :as task-history :refer [TaskHistory]]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.task :as task]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (validation/check-has-application-permission :monitoring)
  {:total  (t2/count TaskHistory)
   :limit  mw.offset-paging/*limit*
   :offset mw.offset-paging/*offset*
   :data   (task-history/all mw.offset-paging/*limit* mw.offset-paging/*offset*)})

(api/defendpoint GET "/:id"
  "Get `TaskHistory` entry with ID."
  [id]
  {id ms/PositiveInt}
  (api/check-404 (api/read-check TaskHistory id)))

(api/defendpoint GET "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (validation/check-has-application-permission :monitoring)
  (task/scheduler-info))

(api/define-routes)
