(ns metabase.feature-extraction.async
  (:require [metabase.api.common :as api]
            [metabase.models
             [computation-job :refer [ComputationJob]]
             [computation-job-result :refer [ComputationJobResult]]]
            [toucan.db :as db]))

(defn- save-result
  [{:keys [id]} payload]
  (println id)
  (db/transaction
    (db/insert! ComputationJobResult
      :job_id     id
      :permanence :temporary
      :payload    payload)
    (db/update! ComputationJob id :status :done)))

(defn compute
  [f]
  (let [job (db/insert! ComputationJob
                        :creator_id api/*current-user-id*
                        :status     :running
                        :type       :simple-job)]
    (future (save-result job (f)))
    (:id job)))

(defn done?
  [{:keys [status]}]
  (= :done status))

(defn result
  [job]
  (if (done? job)
    (if-let [result (db/select-one ComputationJobResult :job_id (:id job))]
      {:status  :done
       :payload (:payload result)}
      {:status :result-not-available})
    {:status :running}))
