(ns metabase-enterprise.transforms.query-impl
  (:require
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.write-connection.core :as write-connection]))

(set! *warn-on-reflection* true)

(defmethod transforms.i/source-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms.i/target-db-id :query
  [transform]
  (-> transform :source :query :database))

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table :table-incremental]]
   [:conn-spec :any]
   [:query ::qp.compile/compiled]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defn- transform-opts [{:keys [transform-type]}]
  (case transform-type
    :table {:overwrite? true}

    ;; once we have more than just append, dispatch on :target-incremental-strategy
    :table-incremental {}))

(defn- run-mbql-transform!
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target owner_user_id creator_id] :as transform} {:keys [run-method start-promise user-id]}]
   (try
     (let [original-db-id    (get-in source [:query :database])
           {driver :engine,
            :as    database} (write-connection/get-effective-database original-db-id)
           transform-details {:db-id          original-db-id
                              :database database
                              :transform-id   id
                              :transform-type (keyword (:type target))
                              :conn-spec (driver/connection-spec driver database)
                              :query (transforms.util/compile-source transform)
                              :output-schema (:schema target)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts (transform-opts transform-details)
           features (transforms.util/required-database-features transform)
           ;; For manual runs, use the triggering user; for cron, use owner/creator
           run-user-id (if (and (= run-method :manual) user-id)
                         user-id
                         (or owner_user_id creator_id))]

       (when (transforms.util/db-routing-enabled? database)
         (throw (ex-info "Transforms are not supported on databases with DB routing enabled."
                         {:driver driver, :database database})))
       (when-not (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :features features})))
       ;; mark the execution as started and notify any observers
       (let [{run-id :id} (transforms.util/try-start-unless-already-running id run-method run-user-id)]
         (when start-promise
           (deliver start-promise [:started run-id]))
         (log/info "Executing transform" id "with target" (pr-str target)
                   (when (write-connection/using-write-connection? database)
                     (str " using write connection (db " (:id database) ")")))
         (transforms.instrumentation/with-stage-timing [run-id [:computation :mbql-query]]
           (transforms.util/run-cancelable-transform!
            run-id driver transform-details
            (fn [_cancel-chan] (driver/run-transform! driver transform-details opts))))
         (transforms.instrumentation/with-stage-timing [run-id [:import :table-sync]]
           (transforms.util/sync-target! target database)
           ;; This event must be published only after the sync is complete - the new table needs to be in AppDB.
           (events/publish-event! :event/transform-run-complete {:object transform-details}))
         ;; Creating an index after sync means the filter column is known in the appdb.
         ;; The index would be synced the next time sync runs, but at time of writing, index sync is disabled.
         (transforms.util/execute-secondary-index-ddl-if-required! transform run-id database target)))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :query [transform opts]
  (run-mbql-transform! transform opts))
