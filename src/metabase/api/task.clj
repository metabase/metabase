(ns metabase.api.task
  "/api/task endpoints"
  (:require
    [compojure.core :refer [GET]]
    [metabase.api
     [common :as api]]
    [metabase.models
     [task-history :as tasks :refer [TaskHistory]]]
    [toucan
     [db :as db]]))


(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (as-> (db/select TaskHistory) tasks))

(api/define-routes)
