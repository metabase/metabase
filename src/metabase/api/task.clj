(ns metabase.api.task
  "/api/task endpoints"
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models.task-history :as task-history :refer [TaskHistory]]
            [metabase.util
             [i18n :as ui18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- check-valid-limit [limit offset]
  (when (and offset (not limit))
    (throw
     (ui18n/ex-info (tru "When including an offset, a limit must also be included.")
       {:status-code 400}))))

(defn- check-valid-offset [limit offset]
  (when (and limit (not offset))
    (throw
     (ui18n/ex-info (tru "When including a limit, an offset must also be included.")
       {:status-code 400}))))

(api/defendpoint GET "/"
  "Fetch a list of recent tasks stored as Task History"
  [limit offset]
  {limit  (s/maybe su/IntStringGreaterThanZero)
   offset (s/maybe su/IntStringGreaterThanOrEqualToZero)}
  (api/check-superuser)
  (check-valid-limit limit offset)
  (check-valid-offset limit offset)
  (let [limit-int  (some-> limit Integer/parseInt)
        offset-int (some-> offset Integer/parseInt)]
    {:total  (db/count TaskHistory)
     :limit  limit-int
     :offset offset-int
     :data   (task-history/all limit-int offset-int)}))

(api/defendpoint GET "/:id"
  "Get `TaskHistory` entry with ID."
  [id]
  (api/read-check TaskHistory id))

(api/define-routes)
