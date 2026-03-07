(ns metabase.transforms.query-impl
  (:require
   [clojure.core.async :as a]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- run-mbql-transform!
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target owner_user_id creator_id] :as transform}
    {:keys [run-method start-promise user-id]}]
   (try
     (let [db          (t2/select-one :model/Database (get-in source [:query :database]))
           driver      (:engine db)
           _           (transforms-base.u/throw-if-db-routing-enabled! transform db)
           run-user-id (if (and (= run-method :manual) user-id)
                         user-id
                         (or owner_user_id creator_id))
           {run-id :id} (transforms.u/try-start-unless-already-running id run-method run-user-id)]
       (when start-promise (deliver start-promise [:started run-id]))
       (driver.conn/with-write-connection
         (log/info "Executing transform" id "with target" (pr-str target)
                   (when (driver.conn/write-connection-requested?) " using write connection"))
         (tracing/with-span :tasks "task.transform.query" {:transform/id          id
                                                           :transform/target-type (name (keyword (:type target)))
                                                           :db/id                 (:id db)
                                                           :db/engine             (name driver)}
           (let [conn-spec         (driver/connection-spec driver db)
                 transform-details {:db-id (:id db) :conn-spec conn-spec :output-schema (:schema target)}]
             (transforms.instrumentation/with-stage-timing [run-id [:computation :mbql-query]]
               (transforms.u/run-cancelable-transform!
                run-id driver transform-details
                (fn [cancel-chan]
                  (let [result (transforms-base.i/execute-base!
                                transform
                                {:cancelled?           #(boolean (a/poll! cancel-chan))
                                 :run-id               run-id
                                 :with-stage-timing-fn (fn [rid stage thunk]
                                                         (transforms.instrumentation/with-stage-timing [rid stage]
                                                           (thunk)))})]
                    ;; Bridge result-map to exception-based flow for run-cancelable-transform!
                    (when-not (= :succeeded (:status result))
                      (throw (or (:error result) (ex-info "Transform failed" {:status (:status result)}))))
                    result))))
             ;; Post-processing: sync, transform_id, events, secondary indexes (after succeed-started-run!)
             (transforms-base.u/complete-execution! transform
                                                    {:run-id               run-id
                                                     :with-stage-timing-fn (fn [rid stage thunk]
                                                                             (transforms.instrumentation/with-stage-timing [rid stage]
                                                                               (thunk)))})))))

     (catch Throwable t
       (if (= :already-running (:error (ex-data t)))
         (log/warnf "Transform %d is already running" id)
         (log/error t "Error executing transform"))
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :query [transform opts]
  (run-mbql-transform! transform opts))
