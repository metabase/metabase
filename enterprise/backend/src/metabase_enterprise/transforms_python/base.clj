(ns metabase-enterprise.transforms-python.base
  "In-memory Python transform execution — no transform_run lifecycle.
  Extracts the core execution logic from execute.clj, returning results without writing transform_run rows."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.util :as driver.u]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- In-memory logging ------------------------------------------------

(defn empty-message-log
  "Returns a new message log.

  Python transforms produce output while they run. The message log is a stateful structure that buffers log outputs.
  The goal is to assist in debugging in the case of python runtime or syntax errors."
  []
  (atom {:pre-python  []
         :python      nil
         :post-python []}))

(defn log!
  "Appends a string to the message log."
  [message-log s]
  (swap! message-log (fn [m] (update m (if (:python m) :post-python :pre-python) conj s)))
  nil)

(defn replace-python-logs!
  "Called when events output is received to copy those events into the message-log."
  [message-log events]
  (swap! message-log assoc :python events)
  nil)

(defn message-log->transform-run-message
  "Presents the content of the log as a string suitable for storage."
  [message-log]
  (let [{:keys [pre-python python post-python]} @message-log]
    (str/join "\n" (concat pre-python
                           (map :message python)
                           post-python))))

;;; ------------------------------------------------- Table schema helpers ---------------------------------------------

(defn table-schema
  "Build a table schema map from a table name and output manifest metadata."
  [table-name metadata]
  {:name (if (keyword? table-name) table-name (keyword table-name))
   :columns (mapv (fn [{:keys [name base_type]}]
                    {:name name
                     :type (python-runner/restricted-insert-type base_type)
                     :nullable? true})
                  (:fields metadata))})

;;; ------------------------------------------------- Data transfer strategies -----------------------------------------

(defn- insert-data!
  "Insert data from source into an existing table."
  [driver db-id table-schema data-source]
  (let [data-source (assoc data-source :table-schema table-schema)]
    (driver/insert-from-source! driver db-id table-schema data-source)))

(defn- create-table-and-insert-data!
  [driver db-id table-schema data-source]
  (transforms-base.util/create-table-from-schema! driver db-id table-schema)
  (insert-data! driver db-id table-schema data-source))

(defn transfer-with-rename-tables-strategy!
  "Transfer data using the rename-tables*! multimethod with atomicity guarantees.
   Creates new table, then atomically renames target->old and new->target, then drops old."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (driver.u/temp-table-name driver table-name)
        temp-table-name   (driver.u/temp-table-name driver table-name)]
    (log/info "Using rename-tables strategy with atomicity guarantees")
    (try
      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms-base.util/rename-tables! driver db-id {table-name temp-table-name
                                                         source-table-name table-name})
      (transforms-base.util/drop-table! driver db-id temp-table-name)
      (catch Exception e
        (log/error e "Failed to transfer data using rename-tables strategy")
        (try
          (transforms-base.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn transfer-with-create-drop-rename-strategy!
  "Transfer data using create + drop + rename to minimize time without data.
   Creates new table, drops old table, then renames new->target."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (driver.u/temp-table-name driver table-name)]
    (log/info "Using create-drop-rename strategy to minimize downtime")
    (try
      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms-base.util/drop-table! driver db-id table-name)
      (driver/rename-table! driver db-id source-table-name table-name)
      (catch Exception e
        (log/error e "Failed to transfer data using create-drop-rename strategy")
        (try
          (transforms-base.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn transfer-with-drop-create-fallback-strategy!
  "Transfer data using drop + create fallback strategy.
   Drops old table, then creates new table directly with target name."
  [driver db-id table-name metadata data-source]
  (log/info "Using drop-create fallback strategy")
  (try
    (transforms-base.util/drop-table! driver db-id table-name)
    (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source)
    (catch Exception e
      (log/error e "Failed to transfer data using drop-create fallback strategy")
      (throw e))))

;;; ------------------------------------------------- Transfer dispatch ------------------------------------------------

(defmulti ^:private transfer-file-to-db
  {:arglists '([driver db transform metadata temp-file])}
  (fn [_ _ transform _ _] (-> transform :target :type keyword)))

(defmethod transfer-file-to-db :table-incremental
  [driver {db-id :id}
   {:keys [target] :as transform}
   metadata temp-file]
  (let [table-name (transforms-base.util/qualified-table-name driver target)
        table-exists? (transforms-base.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]
    (if (not table-exists?)
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source))
      (insert-data! driver db-id (table-schema table-name metadata) data-source))))

(defmethod transfer-file-to-db :table
  [driver {db-id :id :as db}
   {:keys [target] :as transform}
   metadata temp-file]
  (let [table-name (transforms-base.util/qualified-table-name driver target)
        table-exists? (transforms-base.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]
    (cond
      (not table-exists?)
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source))

      (driver.u/supports? driver :atomic-renames db)
      (transfer-with-rename-tables-strategy! driver db-id table-name metadata data-source)

      (driver.u/supports? driver :rename db)
      (transfer-with-create-drop-rename-strategy! driver db-id table-name metadata data-source)

      :else
      (transfer-with-drop-create-fallback-strategy! driver db-id table-name metadata data-source))))

;;; ------------------------------------------------- Core execution ---------------------------------------------------

(defn- start-cancellation-process!
  "Starts a core.async process that optimistically sends a cancellation request if cancel-chan receives a value."
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (python-runner/cancel-python-code-http-call! server-url run-id))))

(defn run-python-transform!
  "Run a Python transform and transfer results to the target database. Returns the python-runner response.
  This is the core execution logic without transform_run tracking."
  [transform db run-id cancel-chan message-log]
  (let [source (:source transform)
        resolved-source-tables (transforms-base.util/resolve-source-tables (:source-tables source))]
    (with-open [shared-storage-ref (s3/open-shared-storage! resolved-source-tables)]
      (let [driver          (:engine db)
            server-url      (transforms-python.settings/python-runner-url)
            _               (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                               :shared-storage @shared-storage-ref
                                                               :source         (assoc source :source-tables resolved-source-tables)
                                                               :cancel-chan    cancel-chan
                                                               :limit          (:limit source)
                                                               :transform-id   (:id transform)})
            _               (start-cancellation-process! server-url run-id cancel-chan)
            {:keys [status body] :as response}
            (python-runner/execute-python-code-http-call!
             {:server-url     server-url
              :code           (:body source)
              :run-id         run-id
              :table-name->id resolved-source-tables
              :shared-storage @shared-storage-ref})

            output-manifest (python-runner/read-output-manifest @shared-storage-ref)
            events          (python-runner/read-events @shared-storage-ref)]
        (replace-python-logs! message-log events)
        (if (not= 200 status)
          (throw (ex-info "Python runner call failed"
                          {:transform-message (i18n/tru "Python execution failure (exit code {0})" (:exit_code body "?"))
                           :status-code       400
                           :api-status-code   status
                           :body              body
                           :events            events}))
          (try
            (let [temp-path (Files/createTempFile "transform-output-" ".jsonl" (u.jvm/varargs FileAttribute))
                  temp-file (.toFile temp-path)]
              (when-not (seq (:fields output-manifest))
                (throw (ex-info "No fields in metadata"
                                {:metadata               output-manifest
                                 :raw-body               body
                                 :events                 events})))
              (try
                (with-open [in (python-runner/open-output @shared-storage-ref)]
                  (io/copy in temp-file))
                (transfer-file-to-db driver db transform output-manifest temp-file)
                (finally
                  (.delete temp-file))))
            response
            (catch Exception e
              (log/error e "Failed to create resulting table")
              (throw (ex-info "Failed to create the resulting table"
                              {:transform-message (or (:transform-message (ex-data e))
                                                      (i18n/tru "Failed to create the resulting table"))}
                              e)))))))))

(defmethod transforms-base.i/execute-base! :python
  [transform opts]
  (try
    (let [message-log (empty-message-log)
          db          (t2/select-one :model/Database (transforms-base.i/target-db-id transform))
          cancel-chan (a/promise-chan)
          run-id      (or (:run-id opts) (str (random-uuid)))]
      (assert (transforms-base.util/python-transform? transform) "Transform must be a python transform")
      (driver.conn/with-write-connection
        (log/info "Executing Python transform (base)" (:id transform))
        (let [result (run-python-transform! transform db run-id cancel-chan message-log)]
          {:status :succeeded
           :result result
           :logs   (message-log->transform-run-message message-log)})))
    (catch Throwable t
      (log/error t "Error executing Python transform (base)")
      {:status :failed
       :error  t})))
