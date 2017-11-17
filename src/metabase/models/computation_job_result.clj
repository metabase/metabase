(ns metabase.models.computation-job-result
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel ComputationJobResult :computation_job_result)

(u/strict-extend (class ComputationJobResult)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {:permanence :keyword
                                       :payload    :json})
          :properties     (constantly {:timestamped? true})}))
