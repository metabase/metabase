(ns metabase.api.task
  "/api/task endpoints"
  (:require
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.models.task-history :as task-history]
   [metabase.request.core :as request]
   [metabase.task :as task]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "Fetch a list of recent tasks stored as Task History"
  []
  (validation/check-has-application-permission :monitoring)
  (let [status (some-> (request/current-request) :query-string codec/form-decode (get "status") not-empty keyword)]
    {:total  (t2/count :model/TaskHistory)
     :limit  (request/limit)
     :offset (request/offset)
     :data   (task-history/all (request/limit) (request/offset) status)}))

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
