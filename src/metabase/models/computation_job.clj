(ns metabase.models.computation-job
  (:require [metabase.api.common :as api]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel ComputationJob :computation_job)

(defn- creator?
  [{:keys [creator_id]}]
  (= creator_id api/*current-user-id*))

(u/strict-extend (class ComputationJob)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {:status  :keyword
                                       :type    :keyword
                                       :context :json})
          :properties     (constantly {:timestamped? true})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  (constantly true)
          :can-write? creator?}))
