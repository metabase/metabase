(ns metabase.task-history.api
  "/api/task endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.task-history.models.task-history :as task-history]
   [metabase.task.core :as task]
   [metabase.util.malli.schema :as ms]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of recent tasks stored as Task History"
  [_
   params :- [:maybe [:merge task-history/FilterParams task-history/SortParams]]]
  (perms/check-has-application-permission :monitoring)
  {:total  (task-history/total params)
   :limit  (request/limit)
   :offset (request/offset)
   :data   (task-history/all (request/limit) (request/offset) params)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get `TaskHistory` entry with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-404 (api/read-check :model/TaskHistory id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (perms/check-has-application-permission :monitoring)
  (task/scheduler-info))

;;; TODO -- this is not necessarily a 'task history' thing and maybe belongs in the `task` module's API rather than
;;; here... maybe a problem for another day.
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/unique-tasks"
  "Returns possibly empty vector of unique task names in alphabetical order. It is expected that number of unique
  tasks is small, hence no need for pagination. If that changes this endpoint and function that powers it should
  reflect that."
  [] :- [:vector string?]
  (perms/check-has-application-permission :monitoring)
  (task-history/unique-tasks))
