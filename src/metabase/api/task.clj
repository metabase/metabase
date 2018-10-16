(ns metabase.api.task
  "/api/task endpoints"
  (:require
    [compojure.core :refer [GET]]
    [metabase.util :as u]
    [metabase.api.common :as api]
    [metabase.models.task-history :as tasks :refer [TaskHistory]]
    [toucan.db :as db]))


(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (api/check-superuser)
  (db/select TaskHistory))

(api/defendpoint GET "/:id"
  "Get `TaskHistory` entry with ID."
  [id]
  (api/read-check TaskHistory id))

(api/define-routes)
