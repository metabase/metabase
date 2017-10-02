(ns metabase.feature-extraction.async
  (:require [metabase.api.common :as api]
            [metabase.models
             [computation-job :refer [ComputationJob]]
             [computation-job-result :refer [ComputationJobResult]]]
            [toucan.db :as db]))

(defonce ^:private running-jobs (atom {}))

(def ^{:arglists '([job])} done?
  "Is the computation job done?"
  (comp some? #{:done :error} :status))

(def ^{:arglists '([job])} running?
  "Is the computation job still running?"
  (comp some? #{:running} :status))

(defn- save-result
  [id payload]
  (db/transaction
    (db/insert! ComputationJobResult
      :job_id     id
      :permanence :cache
      :payload    payload)
    (db/update! ComputationJob id :status :done))
  (swap! running-jobs dissoc id))

(defn- save-error
  [id error]
  (db/transaction
    (db/insert! ComputationJobResult
      :job_id     id
      :permanence :temporary
      :payload    (Throwable->map error))
    (db/update! ComputationJob id :status :error))
  (swap! running-jobs dissoc id))

(defn cancel
  "Cancel computation job (if still running)."
  [{:keys [id] :as job}]
  (when (running? job)
    (future-cancel (@running-jobs id))
    (swap! running-jobs dissoc id)
    (db/update! ComputationJob id :status :canceled)))

(defn compute
  "Compute closure `f` asynchronously. Returns id of the associated computation
   job."
  [ctx f & args]
  (let [id (hash (concat [ctx] args))]
    (when-not (ComputationJob id)
      (db/insert! ComputationJob
        :id         id
        :creator_id api/*current-user-id*
        :status     :running
        :type       :simple-job)
      (swap! running-jobs assoc id (future
                                     (try
                                       (save-result id (apply f args))
                                       (catch Exception e
                                         (save-error id e))))))
    id))

(defn result
  "Get result of an asynchronous computation job."
  [job]
  (if (done? job)
    (if-let [result (db/select-one ComputationJobResult :job_id (:id job))]
      {:status     (:status job)
       :result     (:payload result)
       :created-at (:created_at result)}
      {:status :result-not-available})
    {:status (:status job)}))

(defn running-jobs-user
  "Get all running jobs for a given user."
  ([] (running-jobs-user api/*current-user-id*))
  ([uid]
   (db/select ComputationJob
     :creator_id uid
     :status     "running")))
