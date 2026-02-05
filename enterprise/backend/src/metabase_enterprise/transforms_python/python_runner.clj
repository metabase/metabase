(ns metabase-enterprise.transforms-python.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentQueue)
   (java.io BufferedWriter File InputStream OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- authorization-headers
  "Returns HTTP headers with Authorization bearer token if configured.
  Throws configuration error in production if token is not set."
  []
  (let [api-token (transforms-python.settings/python-runner-api-token)]
    (if api-token
      {"Authorization" (str "Bearer " api-token)}
      (if config/is-prod?
        (throw (ex-info "Python runner API token is required in production but not configured"
                        {:error-type :configuration-error}))
        {}))))

(defn- python-runner-request
  "Helper function for making HTTP requests to the python runner service."
  [server-url method endpoint request-options & extra-args]
  (let [url          (str server-url "/v1" endpoint)
        base-options {:content-type     :json
                      :accept           :json
                      :throw-exceptions false
                      :as               :json
                      :headers          (authorization-headers)}]
    (apply http/request (merge base-options request-options {:method method, :url url}) extra-args)))

(defn root-type
  "Supported type for roundtrip/insertion"
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Number
           :type/Date
           :type/DateTime
           :type/Instant
           :type/DateTimeWithTZ
           :type/Text
           :type/Boolean])))

(defn- maybe-fixup-value [col v]
  (cond
    (nil? (root-type (:base_type col)))
    ;; we're not a supported base type, so we just stringify it
    (when v (json/encode v))

    ;; the clickhouse driver returns bigdecimals for int64 values
    (and (isa? (:base_type col) :type/Integer)
         (or (instance? BigDecimal v)
             (float? v)))
    (bigint v)

    :else
    v))

(defn- write-jsonl-row-to-os-rff
  "Returns a rff that writes query results as JSONL to an OutputStream.

  Only fields present in `fields-meta` are included in the output. Values are processed via
  `maybe-fixup-value` before JSON encoding."
  [^OutputStream os fields-meta {cols-meta :cols}]
  (let [filtered-col-meta (m/index-by :name fields-meta)
        col-names (map :name cols-meta)]
    (fn
      ([]
       (-> os
           (OutputStreamWriter. StandardCharsets/UTF_8)
           (BufferedWriter.)))

      ([^BufferedWriter writer]
       (doto writer
         (.flush)
         (.close)))

      ([^BufferedWriter writer row]
       (let [row-map (->>
                      (map vector col-names row)
                      (filter (fn [[n _]]
                                (contains? filtered-col-meta n)))
                      (map (fn [[n v]]
                             (maybe-fixup-value (filtered-col-meta n) v)))
                      (zipmap (filter filtered-col-meta col-names)))]
         (json/encode-to row-map writer {})
         (doto writer
           (.newLine)))))))

(defn- execute-mbql-query
  [query rff cancel-chan]
  ;; if we have a cancel-chan (a promise channel) for the transform, we'd like for QP to respect it
  ;; and early exit if a value is delivered, but QP closes it when it's done. So we copy it.
  (with-bindings* (cond-> {}
                    cancel-chan
                    (assoc #'qp.pipeline/*canceled-chan* (a/go (a/<! cancel-chan))))
    (^:once fn* []
      (qp/process-query query rff))))

(defn- throw-if-cancelled [cancel-chan]
  (when (a/poll! cancel-chan)
    (throw (ex-info "Run cancelled" {:error-type :cancelled}))))

(defn- write-query-data-to-file! [{:keys [query fields-meta temp-file cancel-chan]}]
  (with-open [os (io/output-stream temp-file)]
    (execute-mbql-query query
                        (fn [cols-meta] (write-jsonl-row-to-os-rff os fields-meta cols-meta))
                        cancel-chan)
    (some-> cancel-chan throw-if-cancelled)
    nil))

(defn restricted-insert-type
  "Type for insertion restricted to supported"
  [base_type]
  (if base_type
    (let [base-type-kw (keyword "type" base_type)]
      (if (root-type base-type-kw)
        base-type-kw
        :type/Text))
    :type/Text))

(defn- closest-ancestor [t pred]
  (loop [remaining (conj PersistentQueue/EMPTY [t])]
    (when-let [t (first remaining)]
      (if (pred t)
        t
        (recur (into (pop t) (parents t)))))))

(defn- effective-semantic-type-i-think
  "Kinda sketchy but maybe reasonable way to infer the effective-semantic-type"
  [{:keys [base_type effective_type semantic_type]}]
  (or semantic_type (closest-ancestor (or effective_type base_type) #(isa? % :Semantic/*))))

(defn- generate-manifest
  "Generate a manifest to communicate schema and metadata information around the table."
  [table-id cols-meta]
  {:schema_version 1
   :data_format    "jsonl"
   :data_version   1
   :table_metadata {:table_id table-id}
   :fields         (mapv (fn [col-meta]
                           {:name           (:name col-meta)
                            :base_type      (some-> (:base_type col-meta) name)
                            :database_type  (some-> (:database_type col-meta) name)
                            :root_type      (some-> (root-type (:base_type col-meta)) name)
                            :semantic_type  (some-> (effective-semantic-type-i-think col-meta) name)
                            :effective_type (some-> (or (:effective_type col-meta) (:database_type col-meta)) name)
                            :field_id       (:id col-meta)})
                         cols-meta)})

(defn get-logs
  "Return the logs of the current running python process"
  [run-id]
  (let [server-url (transforms-python.settings/python-runner-url)]
    (python-runner-request server-url :get "/logs" {:query-params {:request_id run-id}})))

(mu/defn record-python-api-call!
  "Record metrics about Python API calls."
  [job-run-id :- [:maybe pos-int?]
   duration-ms :- int?
   status :- [:enum :success :error :timeout]]
  (log/infof "Python API call %s: run-id=%d duration=%dms" (name status) job-run-id duration-ms)
  (prometheus/inc! :metabase-transforms/python-api-calls-total {:status (name status)})
  (prometheus/observe! :metabase-transforms/python-api-call-duration-ms {} duration-ms))

(defmacro with-python-api-timing
  "Execute body while timing a Python API call."
  [[job-run-id] & body]
  `(transforms.instrumentation/with-timing {:success-fn (fn [job-run-id# duration-ms#]
                                                          (record-python-api-call! job-run-id# duration-ms# :success))
                                            :error-fn   (fn [job-run-id# duration-ms#]
                                                          (record-python-api-call! job-run-id# duration-ms# :error))}
     [~job-run-id]
     (^:once fn* [] ~@body)))

(defn execute-python-code-http-call!
  "Calls the /execute endpoint of the python runner. Blocks until the run either succeeds or fails and returns
  the response from the server."
  [{:keys [server-url code request-id run-id table-name->id shared-storage timeout-secs]}]
  (let [{:keys [objects]} shared-storage
        {:keys [output output-manifest events]} objects
        url-for-path             (fn [path] (:url (get objects path)))
        table-name->url          (update-vals table-name->id #(url-for-path [:table % :data]))
        table-name->manifest-url (update-vals table-name->id #(url-for-path [:table % :manifest]))
        payload                  {:code                code
                                  :library             (t2/select-fn->fn :path :source :model/PythonLibrary)
                                  :timeout             (or timeout-secs (transforms-python.settings/python-runner-timeout-seconds))
                                  :request_id          (or request-id run-id)
                                  :output_url          (:url output)
                                  :output_manifest_url (:url output-manifest)
                                  :events_url          (:url events)
                                  :table_mapping       table-name->url
                                  :manifest_mapping    table-name->manifest-url}
        response                 (with-python-api-timing [run-id]
                                   (python-runner-request server-url :post "/execute" {:body (json/encode payload)}))]
    ;; when a 500 is returned we observe a string in the body (despite the python returning json)
    ;; always try to parse the returned string as json before yielding (could tighten this up at some point)
    (update response :body (fn [string-if-error]
                             (if (string? string-if-error)
                               (try
                                 (json/decode+kw string-if-error)
                                 (catch Exception _
                                   {:error string-if-error}))
                               string-if-error)))))

(defn read-events
  "Returns a vector of event contents (or nil if the event file does not exist)"
  [{:keys [s3-client bucket-name objects]}]
  ;; note we expect :events to be a small file, limits ought to be enforced by the runner
  (when-some [in (s3/open-object s3-client bucket-name (:path (:events objects)))]
    (with-open [in in
                rdr (io/reader in)]
      (mapv json/decode+kw (line-seq rdr)))))

(defn read-output-manifest
  "Return the output manifest map. Returns nil if it does not exist."
  [{:keys [s3-client bucket-name objects]}]
  (json/decode+kw (s3/read-to-string s3-client bucket-name (:path (:output-manifest objects)) "{}")))

(defn open-output
  "Return an InputStream with the output jsonl contents. Close with .close. Returns nil if the object does not exist."
  ^InputStream [{:keys [s3-client bucket-name objects]}]
  (s3/open-object s3-client bucket-name (:path (:output objects))))

(defn cancel-python-code-http-call!
  "Calls the /cancel endpoint of the python runner. Returns immediately."
  [server-url run-id]
  (python-runner-request server-url :post "/cancel" {:body   (json/encode {:request_id run-id})
                                                     :async? true}
                         #_success #(log/debug %)
                         #_failure #(log/error %)))

(defn- safe-delete
  "Safely delete a file."
  [^File file]
  (try (.delete file) (catch Exception _)))

(defn- fields-metadata [_driver table-id]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:order-by [[:database_position :asc]]}))

(defn- build-table-query
  "Build a mbql query for table, might add a proper filter for incremental transforms."
  [table-id source-incremental-strategy transform-id limit]
  (let [db-id             (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id)
        metadata-provider (lib-be/application-database-metadata-provider db-id)
        table-metadata    (lib.metadata/table metadata-provider table-id)
        transform         (t2/select-one :model/Transform transform-id)]
    (cond-> (lib/query metadata-provider table-metadata)
      source-incremental-strategy (transforms.u/preprocess-incremental-query source-incremental-strategy (transforms.u/next-checkpoint transform))
      limit                       (lib/limit limit))))

;; TODO break this up such that s3 can be swapped out for other transfer mechanisms.
(defn copy-tables-to-s3!
  "Writes table content to their corresponding objects named in shared-storage, see (open-shared-storage!).
  Blocks until all tables are fully written and committed to shared storage."
  [{:keys [run-id
           shared-storage
           source
           cancel-chan
           limit
           transform-id]}]
  (when (and (:source-incremental-strategy source)
             (> (count (:source-tables source)) 1))
    (throw (ex-info "Incremental transforms for python only supports one source table" {})))
  (doseq [[table-name v] (:source-tables source)
          :let [table-id                                (if (int? v) v (:table_id v))
                {:keys [s3-client bucket-name objects]} shared-storage
                {data-path :path}                       (get objects [:table table-id :data])
                {manifest-path :path}                   (get objects [:table table-id :manifest])]]
    (let [tmp-data-file (File/createTempFile data-path "")
          tmp-meta-file (File/createTempFile manifest-path "")]
      (try
        (let [db-id       (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id)
              driver      (t2/select-one-fn :engine :model/Database db-id)
              fields-meta (fields-metadata driver table-id)
              manifest    (generate-manifest table-id fields-meta)]
          (transforms.instrumentation/with-stage-timing [run-id [:export :dwh-to-file]]
            (let [query (build-table-query table-id (:source-incremental-strategy source) transform-id limit)]
              (write-query-data-to-file!
               {:query       query
                :fields-meta fields-meta
                :temp-file   tmp-data-file
                :cancel-chan cancel-chan})))
          (with-open [writer (io/writer tmp-meta-file)]
            (json/encode-to manifest writer {}))
          (let [data-size (.length tmp-data-file)
                meta-size (.length tmp-meta-file)]
            (transforms.instrumentation/record-data-transfer! run-id :dwh-to-file data-size nil)
            (transforms.instrumentation/with-stage-timing [run-id [:export :file-to-s3]]
              (s3/upload-file s3-client bucket-name data-path tmp-data-file)
              (s3/upload-file s3-client bucket-name manifest-path tmp-meta-file))
            (transforms.instrumentation/record-data-transfer! run-id :file-to-s3 (+ data-size meta-size) nil)))
        (catch InterruptedException ie (throw ie))
        (catch Throwable t
          (throw (ex-info "An error occurred while copying table data to S3"
                          {:table-id table-id
                           :transform-message (or (:transform-message (ex-data t))
                                                  ;; Cast table-id to string manually, to avoid thousands separators.
                                                  (i18n/tru "Failed to copy table contents to shared storage: {0} ({1})" table-name (str table-id)))}
                          t)))
        (finally
          (safe-delete tmp-data-file)
          (safe-delete tmp-meta-file))))))

(defn execute-and-read-output!
  "Execute Python code and return output rows without persisting to a database.
   Used for dry-run/preview/test-run scenarios.

   Args:
     :code          - Python code to execute
     :source-tables - Map of table-name -> table-id (already resolved)
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
    (let [server-url (transforms-python.settings/python-runner-url)
          _          (copy-tables-to-s3! {:shared-storage @shared-storage-ref
                                          :source         {:source-tables source-tables}
                                          :limit          (or per-input-limit row-limit)})
          {:keys [status body]}
          (execute-python-code-http-call!
           {:server-url     server-url
            :code           code
            :request-id     (u/generate-nano-id)
            :table-name->id source-tables
            :timeout-secs   timeout-secs
            :shared-storage @shared-storage-ref})
          events (read-events @shared-storage-ref)]
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
        (let [output-manifest (read-output-manifest @shared-storage-ref)
              {:keys [fields]} output-manifest]
          ;; TODO (Chris 2026-01-27) -- Disabled this check to match behavior in master, but *real* execution does it.
          ;;      It seems we added the check as part of DRY-ing up transforms code to reuse with workspaces.
          #_(if-not (seq fields)
              {:status  :failed
               :logs    events
               :message (i18n/deferred-tru "No fields in output metadata")})
          (with-open [in  (open-output @shared-storage-ref)
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
