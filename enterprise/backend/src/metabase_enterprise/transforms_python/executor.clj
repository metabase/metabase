(ns metabase-enterprise.transforms-python.executor
  "Where a python transform runs.

  Two execution backends, chosen per transform rather than globally:

  - `:http-runner` — the long-lived python-runner container, shared across runs. Fine for
    transforms that only read source tables: warehouse data in, warehouse data out, no
    credentials and no egress.
  - `:microvm` — one AWS Lambda MicroVM per run, launched and terminated around the job. Used
    for ingestion transforms, which materialize their own input over the network and therefore
    hold API credentials and reach the internet; a shared process is not an acceptable boundary
    for that.

  Both speak the same HTTP protocol, so the difference is lifecycle, not wire format. The data
  plane is S3 with presigned URLs in every case, and everything around the execution step
  (input materialization, reading results back, the DWH transfer) is backend-agnostic."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.microvm :as microvm]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io Closeable)))

(set! *warn-on-reflection* true)

(declare backend-for)

(defmulti run-python-code!
  "Execute python `:code` on the backend chosen for this run, blocking until it completes.

  ctx keys: `:code`, `:run-id`/`:request-id`, `:source-tables`, `:shared-storage`,
  `:timeout-secs`, `:cancel-chan`, `:secrets`, `:state`.

  Returns `{:status <int> :body {:exit_code ..., :timeout ...}}`, 200 meaning success."
  {:arglists '([ctx])}
  ;; dispatch through the var so a reload picks up changes (defmulti itself is idempotent)
  #'backend-for)

(defn- known-backend? [backend]
  (contains? (methods run-python-code!) backend))

(defn- validated-backend [backend setting-name]
  (if (known-backend? backend)
    backend
    (do (log/warnf "Unknown %s %s; falling back to :http-runner" setting-name backend)
        :http-runner)))

(defn ingestion-run?
  "Whether this run is an ingestion transform: python with no source tables, so it fetches its
  own input rather than reading the warehouse."
  [{:keys [source-tables]}]
  (empty? source-tables))

(defn backend-for
  "The execution backend for a run. Ingestion runs are routed separately because they carry
  credentials and reach the internet."
  [ctx]
  (if (ingestion-run? ctx)
    (validated-backend (transforms-python.settings/python-ingestion-execution-backend)
                       "python-ingestion-execution-backend")
    (validated-backend (transforms-python.settings/python-execution-backend)
                       "python-execution-backend")))

;;; ------------------------------------------------- Live log polling -------------------------------------------------

;; Logs are surfaced to the UI while a run is in flight (see
;; `metabase-enterprise.transforms-python.execute`), but the poller only has a run id and the
;; endpoint it should ask depends on the backend — and, for a MicroVM, on that run's VM. Runs
;; register what the poller needs for their duration.
(defonce ^:private live-runs (atom {}))

(defn- register-run! [run-id info]
  (when run-id
    (swap! live-runs assoc run-id info)))

(defn- unregister-run! [run-id]
  (when run-id
    (swap! live-runs dissoc run-id)))

(defn register-run-closeable!
  "Register a run for log polling, unregistering it on close (for `with-open`)."
  ^Closeable [run-id ctx]
  (register-run! run-id {:backend (backend-for ctx)})
  (reify Closeable
    (close [_] (unregister-run! run-id))))

(defn- set-run-endpoint!
  "Record the base URL a MicroVM run's logs can be read from, once its VM is up."
  [run-id endpoint]
  (when run-id
    (swap! live-runs update run-id assoc :endpoint endpoint)))

(defmulti fetch-logs
  "Events logged so far by an in-flight run, shaped like the runner's `/logs` response:
  `{:status <int> :body {:execution_id <run-id> :events [{:message ...} ...]}}`. A 404 means
  \"nothing yet\" and the caller keeps polling."
  {:arglists '([run-id])}
  (fn [run-id] (get-in @live-runs [run-id :backend] :http-runner)))

(defmethod fetch-logs :http-runner
  [run-id]
  (python-runner/get-logs run-id))

(defmethod fetch-logs :microvm
  [run-id]
  (if-let [endpoint (get-in @live-runs [run-id :endpoint])]
    (microvm/fetch-logs endpoint)
    ;; the VM isn't up yet
    {:status 404 :body {}}))

;;; ------------------------------------------------- Backends -------------------------------------------------

(defmethod run-python-code! :http-runner
  [{:keys [run-id request-id cancel-chan] :as ctx}]
  (let [server-url (transforms-python.settings/python-runner-url)
        req-id     (or request-id run-id)]
    (when cancel-chan
      (a/go (when (a/<! cancel-chan)
              (python-runner/cancel-python-code-http-call! server-url req-id))))
    (python-runner/execute-python-code-http-call! (assoc ctx :server-url server-url))))

(defmethod run-python-code! :microvm
  [{:keys [run-id cancel-chan timeout-secs] :as ctx}]
  (let [timeout-secs (or timeout-secs (transforms-python.settings/python-runner-timeout-seconds))
        payload      (python-runner/execute-payload ctx)]
    ;; The VM is the run: launched here, terminated in the finally regardless of outcome, and
    ;; never reused. Cancellation is that termination — user code cannot decline it.
    (microvm/with-microvm
      {:run-id run-id}
      (fn [{:keys [endpoint auth-token terminate!]}]
        (set-run-endpoint! run-id endpoint)
        (when cancel-chan
          (a/go (when (a/<! cancel-chan)
                  (log/infof "Cancelling run %s by terminating its MicroVM" run-id)
                  (terminate!))))
        (microvm/run-job! endpoint payload timeout-secs auth-token)))))

;;; ------------------------------------------------- Ad-hoc execution -------------------------------------------------

(defn execute-and-read-output!
  "Execute Python code via the configured backend and return output rows without persisting to a
   database. Used for dry-run/preview/test-run scenarios.

   Args:
     :code          - Python code to execute
     :source-tables - Sequential of source-table entries [{:alias ... :table_id ...} ...]
     :row-limit     - Max rows to return (also limits input rows)
     :timeout-secs  - Optional timeout override

   Returns:
     {:status  :succeeded/:failed
      :cols    [{:name ...} ...]      ; on success
      :rows    [[...] ...]            ; on success, values in column order
      :logs    [{:message ...} ...]   ; events from Python execution
      :message \"error message\"}     ; on failure
"
  [{:keys [code source-tables per-input-limit row-limit timeout-secs]}]
  (with-open [shared-storage-ref (s3/open-shared-storage! source-tables)]
    (let [_ (python-runner/copy-tables-to-s3! {:shared-storage @shared-storage-ref
                                               :source         {:source-tables source-tables}
                                               :limit          (or per-input-limit row-limit)})
          {:keys [status body]}
          (run-python-code!
           {:code           code
            :request-id     (u/generate-nano-id)
            :source-tables  source-tables
            :timeout-secs   timeout-secs
            :shared-storage @shared-storage-ref})
          events (python-runner/read-events @shared-storage-ref)]
      (cond
        (:timeout body)
        {:status  :failed
         :logs    events
         :message (i18n/deferred-tru "Python execution timed out")}

        (not= 200 status)
        {:status  :failed
         :logs    events
         :message (i18n/deferred-tru "Python execution failure (exit code {0})" (:exit_code body "?"))}

        :else
        (let [output-manifest (python-runner/read-output-manifest @shared-storage-ref)
              {:keys [fields]} output-manifest]
          (with-open [in  (python-runner/open-output @shared-storage-ref)
                      rdr (io/reader in)]
            (let [cols (mapv (fn [c]
                               {:name      (:name c)
                                :base_type (some-> c :base_type keyword)})
                             fields)
                  rows (into []
                             (comp
                              (remove str/blank?)
                              (take row-limit)
                              (map json/decode))
                             (line-seq rdr))]
              {:status :succeeded
               :cols   cols
               :rows   rows
               :logs   events})))))))
