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
  [{:keys [id]} payload]
  (db/transaction
    (db/insert! ComputationJobResult
      :job_id     id
      :permanence :temporary
      :payload    payload)
    (db/update! ComputationJob id :status :done))
  (swap! running-jobs dissoc id))

(defn- save-error
  [{:keys [id]} error]
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
  [f]
  (let [job (db/insert! ComputationJob
                        :creator_id api/*current-user-id*
                        :status     :running
                        :type       :simple-job)
        id  (:id job)]
    (swap! running-jobs assoc id (future
                                   (try
                                     (save-result job (f))
                                     (catch Exception e
                                       (save-error job e)))))
    id))

(defn result
  "Get result of an asynchronous computation job."
  [job]
  (if (done? job)
    (if-let [result (db/select-one ComputationJobResult :job_id (:id job))]
      {:status (:status job)
       :result (:payload result)}
      {:status :result-not-available})
    {:status (:status job)}))
