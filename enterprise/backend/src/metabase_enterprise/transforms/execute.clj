(ns metabase-enterprise.transforms.execute
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.python-runner.api :as python-runner.api]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table]]
   [:connection-details :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defmacro with-transform-lifecycle
  "Macro to manage transform run lifecycle. Starts a run, executes body,
   and handles success/failure appropriately.

   Usage:
   (with-transform-lifecycle [run-id transform-id opts]
     ;; body that returns result on success or throws on failure
     )"
  [[run-id-sym [transform-id opts]] & body]
  `(let [{~run-id-sym :id} (transform-run/start-run! ~transform-id ~opts)]
     (try
       (let [result# (do ~@body)]
         (transform-run/succeed-started-run! ~run-id-sym)
         result#)
       (catch Throwable t#
         (transform-run/fail-started-run! ~run-id-sym {:message (.getMessage t#)})
         (throw t#)))))

(defn- sync-target!
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database _run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target) "for transform")
   (transforms.util/activate-table-and-mark-computed! database target)))

(defn run-transform!
  "Run a compiled transform"
  [run-id driver transform-details opts]
  ;; local run is responsible for status, using canceling lifecycle
  (try
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
      (canceling/chan-start-run! run-id qp.pipeline/*canceled-chan*)
      (driver/run-transform! driver transform-details opts))
    (transform-run/succeed-started-run! run-id)
    (catch Throwable t
      (transform-run/fail-started-run! run-id {:message (.getMessage t)})
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

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
           feature (transforms.util/required-database-feature transform)
           transform-details {:transform-type (keyword (:type target))
                              :connection-details (driver/connection-details driver database)
                              :query (transforms.util/compile-source source)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts {:overwrite? true}]
       (when-not (driver.u/supports? driver feature database)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :feature feature})))
       ;; mark the execution as started and notify any observers
       (let [{run-id :id} (try
                            (transform-run/start-run! id {:run_method run-method})
                            (catch java.sql.SQLException e
                              (if (= (.getSQLState e) "23505")
                                (throw (ex-info "Transform is already running"
                                                {:error :already-running
                                                 :transform-id id}
                                                e))
                                (throw e))))]
         (when start-promise
           (deliver start-promise [:started run-id]))
         (log/info "Executing transform" id "with target" (pr-str target))
         (run-transform! run-id driver transform-details opts)
         (sync-target! target database run-id)))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

(defn- call-python-runner-api!
  "Call the Python runner API endpoint to execute Python code.
   Returns the result map or throws on error."
  [code]
  ;; TODO: Add connection-str parameter once the API supports it
  (let [base-url (transforms.settings/python-runner-base-url)
        api-key  (transforms.settings/python-runner-api-key)
        headers  (cond-> {}
                   api-key (assoc "X-API-Key" api-key))
        response (http/post (str base-url "/api/python-runner/execute")
                            {:content-type :json
                             :accept :json
                             :as :json
                             :body (json/generate-string {:code code})
                             :headers headers
                             :throw-exceptions? false})]
    (if (= 200 (:status response))
      (:body response)
      (throw (ex-info "Python runner API call failed"
                      {:status (:status response)
                       :body (:body response)})))))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner."
  [transform {:keys [run_method]}]
  (when (transforms.util/python-transform? transform)
    (let [{:keys [source
                  target]}        transform
          {:keys [target-database
                  body]}          source
          {:keys [schema name]}   target
          db                      (t2/select-one :model/Database target-database)
          driver                  (:engine db)]
      (try

        (with-transform-lifecycle [run-id [(:id transform) {:run_method run_method}]]
          ;; TODO: Pass connection-str to API once it supports it
          ;; For now, the connection string needs to be embedded in the Python code
          (let [result (call-python-runner-api! body)]
            (if (or (:error result)
                    (get-in result [:body :error]))
              (let [error-data (or (:body result) result)]
                (throw (ex-info (str/join "\n"
                                      [(format "exit code %d" (:exit-code body))
                                       "======"
                                       "stdout"
                                       "======"
                                       (:stdout body)
                                       "stderr"
                                       "======"
                                       (:stderr body)])
                                {:status-code 400
                                 :error       (or (:stderr error-data) (:error error-data))
                                 :stdout      (:stdout error-data)
                                 :stderr      (:stderr error-data)})))
              (try
                ;; TODO would be nice if we have create or replace in upload
                (when-let [table (t2/select-one :model/Table
                                                :name (ddl.i/format-name driver name)
                                                :schema (ddl.i/format-name driver schema)
                                                :db_id (:id db))]
                  (upload/delete-upload! table)
                  ;; TODO shouldn't this be handled in upload?
                  (t2/delete! :model/Table (:id table)))
                (upload/create-from-csv-and-sync! {:db         db
                                                   :filename   (.getName (File. ^String (:output-file result)))
                                                   :file       (File. ^String (:output-file result))
                                                   :schema     schema
                                                   :table-name name})
                {:run_id run-id
                 :result result}
                (finally
                  (python-runner.api/cleanup-output-files! result))))))
        (catch Exception e
          (log/error e "Failed to execute transform")
          (throw (ex-info "Failed to execute Python transform"
                          {:error (.getMessage e)})))))))
