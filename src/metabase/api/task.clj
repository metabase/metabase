(ns metabase.api.task
  "/api/task endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.models.task-history :as task-history]
   [metabase.request.core :as request]
   [metabase.task :as task]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "Fetch a list of recent tasks stored as Task History"
  [_
   {:keys [_status _task]
    :as filter} :- ::task-history/filter]
  (validation/check-has-application-permission :monitoring)
  {:total  (t2/count :model/TaskHistory)
   :limit  (request/limit)
   :offset (request/offset)
   :data   (task-history/all (request/limit) (request/offset) filter)})

(api.macros/defendpoint :get "/:id"
  "Get `TaskHistory` entry with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-404 (api/read-check :model/TaskHistory id)))

(api.macros/defendpoint :get "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (validation/check-has-application-permission :monitoring)
  (task/scheduler-info))

(api.macros/defendpoint :get "/unique_tasks"
  [] :- [:vector string?]
  (validation/check-has-application-permission :monitoring)
  (task-history/unique-tasks))