(ns metabase-enterprise.transforms.execute
  (:require
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table :table-incremental]]
   [:conn-spec :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defn- transform-opts [{:keys [transform-type]}]
  (case transform-type
    :table {:overwrite? true}

    ;; once we have more than just append, dispatch on :target-incremental-strategy
    :table-incremental {}))

(defn run-mbql-transform!
  "Run `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           transform-details {:db-id db
                              :transform-id   id
                              :transform-type (keyword (:type target))
                              :conn-spec (driver/connection-spec driver database)
                              :query (transforms.util/compile-source source)
                              :output-schema (:schema target)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts (transform-opts transform-details)
           ;; mark the execution as started and notify any observers
           {run-id :id} (transforms.util/try-start-unless-already-running id run-method)]
       (when start-promise
         (deliver start-promise [:started run-id]))
       (log/info "Executing transform" id "with target" (pr-str target))
       (transforms.instrumentation/with-stage-timing [run-id [:computation :mbql-query]]
         (transforms.util/run-cancelable-transform!
          run-id driver transform-details
          (fn [_cancel-chan] (driver/run-transform! driver transform-details opts))))
       (transforms.util/maybe-upsert-watermark! transform driver database)
       (transforms.instrumentation/with-stage-timing [run-id [:import :table-sync]]
         (transforms.util/sync-target! target database run-id)
         ;; This event must be published only after the sync is complete - the new table needs to be in AppDB.
         (events/publish-event! :event/transform-run-complete {:object transform-details})))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))
