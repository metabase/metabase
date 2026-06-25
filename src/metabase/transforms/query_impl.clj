(ns metabase.transforms.query-impl
  (:require
   [clojure.core.async :as a]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise resolve-transform-target
  "Hook for workspace isolation: given a database id and a transform's canonical target
  `{:schema ..., :name ...}`, returns the target the transform should actually write to.

  When workspace isolation is active for `db-id`, the EE impl rewrites the target's
  `:schema` to the workspace's output schema and records a `TableRemapping` so that
  subsequent queries against the canonical `(schema, name)` pair resolve to the
  workspace copy via the QP middleware.

  OSS / no-workspace fallback: returns the target unchanged."
  metabase-enterprise.workspaces.transform-hooks
  [_db-id target]
  target)

(defn- run-mbql-transform!
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target owner_user_id creator_id] :as transform}
    {:keys [run-method on-start user-id job-run-id]}]
   ;; `:target` is already workspace-rewritten — `resolve-transform-target` runs in
   ;; `metabase.transforms.execute/execute!` before dispatch.
   (try
     (let [db          (t2/select-one :model/Database (get-in source [:query :database]))
           driver      (:engine db)
           _           (transforms-base.u/throw-if-db-routing-enabled! transform db)
           run-user-id (if (and (= run-method :manual) user-id)
                         user-id
                         (or owner_user_id creator_id))
           {run-id :id} (transforms.u/try-start-unless-already-running id run-method run-user-id :job-run-id job-run-id)]
       (when on-start (on-start run-id))
       (driver.conn/with-write-connection
         (log/info "Executing transform" id "with target" (pr-str target)
                   "using" (driver.conn/connection-telemetry-info))
         (let [target-type (keyword (:type target))]
           (tracing/with-span :tasks "task.transform.query"
             {:transform/id                   id
              :transform/target-type          (name target-type)
              :transform/incremental          (= :table-incremental target-type)
              :transform/full-incremental-run (transforms-base.u/full-incremental-run? transform)
              :db/id                          (:id db)
              :db/engine                      (name driver)}
             (let [conn-spec         (driver/connection-spec driver db)
                   transform-details {:db-id (:id db) :conn-spec conn-spec :output-schema (:schema target)}
                   _exec-result
                   (transforms.instrumentation/with-stage-timing [run-id [:computation :mbql-query]]
                     (transforms.u/run-cancelable-transform!
                      run-id transform driver transform-details
                      (fn [cancel-chan source-range-params]
                        (let [result (transforms-base.i/execute-base!
                                      transform
                                      {:cancelled?           #(boolean (a/poll! cancel-chan))
                                       :run-id               run-id
                                       :source-range-params  source-range-params
                                       :with-stage-timing-fn (fn [rid stage thunk]
                                                               (transforms.instrumentation/with-stage-timing [rid stage]
                                                                 (thunk)))})]
                          ;; Bridge result-map to exception-based flow for run-cancelable-transform!
                          (when-not (= :succeeded (:status result))
                            (throw (or (:error result) (ex-info "Transform failed" {:status (:status result)}))))
                          result))))]
               ;; Post-processing: sync, transform_id, events
               (transforms-base.u/complete-execution! transform {}))))))
     (catch Throwable t
       (if (= :already-running (:error (ex-data t)))
         (log/warnf "Transform %d is already running" id)
         (log/error t "Error executing transform"))
       (throw t)))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :query [transform opts]
  (run-mbql-transform! transform opts))
