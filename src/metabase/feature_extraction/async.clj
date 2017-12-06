(ns metabase.feature-extraction.async
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.public-settings :as public-settings]
            [metabase.models
             [computation-job :refer [ComputationJob]]
             [computation-job-result :refer [ComputationJobResult]]]
            [metabase.util :as u]
            [toucan.db :as db]))

(defonce ^:private running-jobs (atom {}))

(def ^{:arglists '([job])} done?
  "Is the computation job done?"
  (comp some? #{:done :error} :status))

(def ^{:arglists '([job])} running?
  "Is the computation job still running?"
  (comp some? #{:running} :status))

(def ^{:arglists '([job])} canceled?
  "Has the computation job been canceled?"
  (comp some? #{:canceled} :status))

(defn- save-result
  [{:keys [id]} payload]
  (when-not (future-cancelled? (@running-jobs id))
    (db/transaction
      (db/insert! ComputationJobResult
        :job_id     id
        :permanence :temporary
        :payload    payload)
      (db/update! ComputationJob id
        :status   :done
        :ended_at (u/new-sql-timestamp))))
  (swap! running-jobs dissoc id)
  (log/info (format "Async job %s done." id))
  payload)

(defn- save-error
  [{:keys [id]} error]
  (let [error (Throwable->map error)]
    (when-not (future-cancelled? (@running-jobs id))
      (log/warn (format "Async job %s encountered an error:\n%s." id error))
      (db/transaction
        (db/insert! ComputationJobResult
          :job_id     id
          :permanence :temporary
          :payload    error)
        (db/update! ComputationJob id
          :status :error
          :ended_at (u/new-sql-timestamp))))
    (swap! running-jobs dissoc id)
    error))

(defn cancel
  "Cancel computation job (if still running)."
  [{:keys [id] :as job}]
  (when (running? job)
    (db/update! ComputationJob id :status :canceled)
    (future-cancel (@running-jobs id))
    (swap! running-jobs dissoc id)
    (log/info (format "Async job %s canceled." id))))

(defn- time-delta-seconds
  [^java.util.Date a ^java.util.Date b]
  (Math/round (/ (- (.getTime b) (.getTime a)) 1000.0)))

(defn- fresh?
  "Is the cached job still fresh?

   Uses the same logic as `metabase.api.card`."
  [{:keys [created_at ended_at]}]
  (let [duration (time-delta-seconds created_at ended_at)
        ttl     (* duration (public-settings/query-caching-ttl-ratio))
        age     (time-delta-seconds ended_at (java.util.Date.))]
    (<= age ttl)))

(defn- cached-job
  [ctx]
  (when (public-settings/enable-query-caching)
    (let [job (db/select-one ComputationJob
                :context (json/encode ctx)
                :status  [:not= "error"]
                {:order-by [[:ended_at :desc]]})]
      (when (some-> job fresh?)
        job))))

(defn compute
  "Compute closure `f` in context `ctx` asynchronously. Returns id of the
   associated computation job.

   Will return cached result if query caching is enabled and a job with identical
   context has successfully run within TTL."
  [ctx f]
  (or (-> ctx cached-job :id)
      (let [{:keys [id] :as job} (db/insert! ComputationJob
                                   :creator_id api/*current-user-id*
                                   :status     :running
                                   :type       :simple-job
                                   :context    ctx)]
        (log/info (format "Async job %s started." id))
        (swap! running-jobs assoc id (future
                                       (try
                                         (save-result job (f))
                                         (catch Throwable e
                                           (save-error job e)))))
        id)))

(defmacro with-async
  "Asynchronously evaluate expressions in lexial contexet of `bindings`.

   Note: when caching is enabled `bindings` (both their shape and values) are
   used to determine cache hits and should be used for all parameters that
   disambiguate the call."
  [bindings & body]
  (let [binding-vars (vec (take-nth 2 bindings))]
    `(let ~bindings
       (compute {:source   (quote ~body)
                 :bindings (quote ~bindings)
                 :closure  (zipmap (quote ~binding-vars) ~binding-vars)}
                (fn [] ~@body)))))

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
