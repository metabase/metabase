(ns metabase-enterprise.transforms-python.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   ;; TODO check that querying team are ok with us accessing this directly, otherwise make another plan
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentQueue)
   (java.io BufferedWriter File OutputStream OutputStreamWriter)
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
  [server-url method endpoint & [request-options]]
  (let [base-options {:content-type     :json
                      :accept           :json
                      :throw-exceptions false
                      :as               :json
                      :headers          (authorization-headers)}]
    (http/request (merge base-options
                         request-options
                         {:method method
                          :url    (str server-url "/v1" endpoint)}))))

(defn- write-to-stream! [^OutputStream os col-names reducible-rows]
  (let [none? (volatile! true)
        writer (-> os
                   (OutputStreamWriter. StandardCharsets/UTF_8)
                   (BufferedWriter.))]

    (run! (fn [row]
            (when @none? (vreset! none? false))
            (let [row-map (zipmap col-names row)]
              (json/encode-to row-map writer {})
              (.newLine writer)))
          reducible-rows)

    ;; Workaround for LocalStack, which doesn't support zero byte files.
    (when @none?
      (.write writer " "))

    (doto writer
      (.flush)
      (.close))))

(defn- execute-mbql-query
  [driver db-id query respond cancel-chan]
  (driver/with-driver driver
    (let [native (qp.compile/compile {:type :query, :database db-id :query query})
          query  {:database db-id
                  :type     :native
                  :native   native}]
      (qp.store/with-metadata-provider db-id
        (binding [qp.pipeline/*canceled-chan* cancel-chan]
          (driver/execute-reducible-query driver query {:canceled-chan cancel-chan} respond))))))

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
  "Generate a metadata manifest for the table columns."
  [table-id cols-meta]
  {:schema_version 1
   :data_format    "jsonl"
   :data_version   1
   :fields         (mapv (fn [col-meta]
                           {:name           (:name col-meta)
                            :base_type      (some-> (:base_type col-meta) name)
                            :database_type  (some-> (:database_type col-meta) name)
                            :root_type      (some-> (root-type (:base_type col-meta)) name)
                            ;; replace nil values with values indicating how they behave in practice.
                            ;; there may be better ways of doing this already, but i worry it's just implicit in QP
                            :semantic_type  (some-> (effective-semantic-type-i-think col-meta) name)
                            :effective_type (some-> (or (:effective_type col-meta) (:database_type col-meta)) name)
                            ;; TODO get this passed through
                            :field_id       (:id col-meta)})
                         cols-meta)
   :table_metadata {:table_id table-id}})

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

(defn- preprocess-fields-meta [_driver fields-meta]
  (->> fields-meta
       ;; we are only interested in the parent objects, so we filter out any nested values
       (filter #(and (nil? (:parent_id %)) (nil? (:nfc_path %))))

       #_(map (fn [meta]
                ;; TODO move this into driver method
                (cond

                  (= driver :bigquery-cloud-sdk)
                  (case (:database_type meta)
                    ;; the bigquery driver returns a lossy database-type
                    ;; so we must translate to a valid one, even if it may be lossy
                    ("ARRAY" "RECORD") (assoc meta :database_type "JSON" :base_type :type/JSON)
                    "FLOAT" (assoc meta :database_type "FLOAT64")
                    meta)

                  (= driver :postgres)
                  (if (str/starts-with? (:database_type meta) "_")
                    (assoc meta :base_type :type/Array)
                    meta)

                  (= driver :mysql)
                  (case (:database_type meta)
                    ("ENUM" "VARCHAR" "SET")
                    (dissoc meta :database_type)

                    "VARBINARY"
                    (assoc meta :database_type "BINARY")

                    meta)

                  :else
                  meta)))))

(defn- write-table-data-to-file! [id temp-file cancel-chan]
  (let [db-id       (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver      (t2/select-one-fn :engine :model/Database db-id)
        fields-meta (->> (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position :nfc_path :parent_id]
                                    :table_id id
                                    :active true
                                    {:order-by [[:database_position :asc]]})
                         (preprocess-fields-meta driver))

        query    {:source-table id}
        manifest (generate-manifest id fields-meta)]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream temp-file)]
                            (let [filtered-col-meta (m/index-by :name fields-meta)
                                  col-names         (map :name cols-meta)
                                  filtered-rows     (eduction (map (fn [row]
                                                                     (->>
                                                                      (map vector col-names row)
                                                                      (filter (fn [[n _]]
                                                                                (contains? filtered-col-meta n)))
                                                                      (map (fn [[n v]]
                                                                             (maybe-fixup-value (filtered-col-meta n) v))))))
                                                              reducible-rows)]
                              (write-to-stream! os (filter filtered-col-meta col-names) filtered-rows))))
                        cancel-chan)
    manifest))

(defn get-logs
  "Return the logs of the current running python process"
  [run-id]
  (let [server-url (transforms-python.settings/python-runner-url)]
    (python-runner-request server-url :get "/logs" {:query-params {:request_id run-id}})))

(defn execute-python-code-http-call!
  "Calls the /execute endpoint of the python runner. Blocks until the run either succeeds or fails and returns
  the response from the server."
  [{:keys [server-url code run-id table-name->id shared-storage]}]
  (let [{:keys [objects]} shared-storage
        {:keys [output output-manifest events]} objects

        url-for-path             (fn [path] (:url (get objects path)))
        table-name->url          (update-vals table-name->id #(url-for-path [:table % :data]))
        table-name->manifest-url (update-vals table-name->id #(url-for-path [:table % :manifest]))

        payload                  {:code                code
                                  :library             (t2/select-fn->fn :path :source :model/PythonLibrary)
                                  :timeout             30
                                  :request_id          run-id
                                  :output_url          (:url output)
                                  :output_manifest_url (:url output-manifest)
                                  :events_url          (:url events)
                                  :table_mapping       table-name->url
                                  :manifest_mapping    table-name->manifest-url}

        response                 (transforms.instrumentation/with-python-api-timing [run-id]
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

(defn- cancel-python-code-http-call! [server-url run-id]
  (python-runner-request server-url :post "/cancel" {:body   (json/encode {:request_id run-id})
                                                     :async? true}
                         #_success #(log/debug %)
                         #_failure #(log/error %)))

(defn open-cancellation-process!
  "Starts a core.async process that optimistically sends a cancellation request to the python executor if cancel-chan receives a value.
  Returns a channel that will receive either the async http call j.u.c.FutureTask in the case of cancellation, or nil when the cancel-chan is closed."
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (cancel-python-code-http-call! server-url run-id))))

;; temporary, we should not need to realize data/events files into memory longer term
(defn read-output-objects
  "Temporary function that strings/jsons stuff in S3 and returns it for compatibility."
  [{:keys [s3-client bucket-name objects]}]
  (let [{:keys [output output-manifest events]} objects
        output-content          (s3/read-to-string s3-client bucket-name (:path output) nil)
        output-manifest-content (s3/read-to-string s3-client bucket-name (:path output-manifest) "{}")
        events-content          (s3/read-to-string s3-client bucket-name (:path events))]
    {:output          output-content
     :output-manifest (json/decode+kw output-manifest-content)
     :events          (mapv json/decode+kw (str/split-lines events-content))}))

(defn- safe-delete
  "Safely delete a file."
  [^File file]
  (try (.delete file) (catch Exception _)))

;; TODO break this up such that s3 can be swapped out for other transfer mechanisms.
(defn copy-tables-to-s3!
  "Writes table content to their corresponding objects named in shared-storage, see (open-shared-storage!).
  Blocks until all tables are fully written and committed to shared storage."
  [{:keys [run-id
           shared-storage
           table-name->id
           cancel-chan]}]
  ;; TODO there's scope for some parallelism here, in particular across different databases
  (doseq [id (vals table-name->id)
          :let [{:keys [s3-client bucket-name objects]} shared-storage
                {data-path :path}                       (get objects [:table id :data])
                {manifest-path :path}                   (get objects [:table id :manifest])]]
    (let [temp-file     (File/createTempFile data-path "")
          manifest-file (File/createTempFile manifest-path "")]
      (try
        ;; Write table data to temporary file and get manifest
        (let [manifest (transforms.instrumentation/with-stage-timing [run-id :dwh-to-file]
                         (write-table-data-to-file! id temp-file cancel-chan))]
          ;; Write manifest to file
          (with-open [writer (io/writer manifest-file)]
            (json/encode-to manifest writer {}))
          (let [file-size     (.length temp-file)
                manifest-size (.length manifest-file)]
            (transforms.instrumentation/record-data-transfer! run-id :dwh-to-file file-size nil)

            ;; Upload both files to S3
            (transforms.instrumentation/with-stage-timing [run-id :file-to-s3]
              (s3/upload-file s3-client bucket-name data-path temp-file)
              (s3/upload-file s3-client bucket-name manifest-path manifest-file))

            (transforms.instrumentation/record-data-transfer! run-id :file-to-s3 (+ file-size manifest-size) nil)))
        (finally
          ;; Clean up temporary files
          (safe-delete temp-file)
          (safe-delete manifest-file))))))

#_(remove-ns (ns-name *ns*))
