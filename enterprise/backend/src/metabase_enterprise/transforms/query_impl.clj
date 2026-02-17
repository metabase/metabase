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
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

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

(defn- transform-opts [_transform-details]
  ;; once we have more than just :table and :table-incremental as transform-types,
  ;; then we can dispatch on :target-incremental-strategy
  {})

(defn- throw-if-db-routing-enabled [transform driver database]
  (when (transforms.util/db-routing-enabled? database)
    (throw (ex-info (i18n/tru "Failed to run the transform ({0}) because the database ({1}) has database routing turned on. Running transforms on databases with db routing enabled is not supported."
                              (:name transform)
                              (:name database))
                    {:driver driver, :database database}))))

(defn- run-mbql-transform!
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           ;; important to test routing before calling compile-source (whose qp middleware will also throw)
           _ (throw-if-db-routing-enabled transform driver database)
           transform-details {:db-id db
                              :database database
                              :transform-id   id
                              :transform-type (keyword (:type target))
                              :conn-spec (driver/connection-spec driver database)
                              :query (transforms.util/compile-source transform)
                              :output-schema (:schema target)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts (transform-opts transform-details)
           features (transforms.util/required-database-features transform)]

       (when-not (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :features features})))
       ;; mark the execution as started and notify any observers
       (let [{run-id :id} (transforms.util/try-start-unless-already-running id run-method)]
         (when start-promise
           (deliver start-promise [:started run-id]))
         (log/info "Executing transform" id "with target" (pr-str target))
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
