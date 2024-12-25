(ns metabase.api.task
  "/api/task endpoints"
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.task-history :as task-history]
   [metabase.request.core :as request]
   [metabase.task :as task]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (validation/check-has-application-permission :monitoring)
  {:total  (t2/count :model/TaskHistory)
   :limit  (request/limit)
   :offset (request/offset)
   :data   (task-history/all (request/limit) (request/offset))})

(api/defendpoint GET "/:id"
  "Get `TaskHistory` entry with ID."
  [id]
  {id ms/PositiveInt}
  (api/check-404 (api/read-check :model/TaskHistory id)))

(api/defendpoint GET "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (validation/check-has-application-permission :monitoring)
  (task/scheduler-info))

(api/define-routes)
