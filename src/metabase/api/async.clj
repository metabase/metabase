(ns metabase.api.async
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.feature-extraction.async :as async]
            [metabase.models
             [computation-job :refer [ComputationJob]]]))

(api/defendpoint GET "/:id"
  "Get result of async computation job with ID."
  [id]
  (->> id
       (api/read-check ComputationJob)
       async/result))

(api/defendpoint GET "/running-jobs"
  "Get all running jobs belonging to the current user."
  []
  (map :id (async/running-jobs-user)))

(api/define-routes)
