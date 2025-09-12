(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io BufferedWriter Closeable File OutputStream OutputStreamWriter)
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.time Duration)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.auth.credentials DefaultCredentialsProvider)
   (software.amazon.awssdk.core.sync RequestBody)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.s3 S3Client S3ClientBuilder S3Configuration)
   (software.amazon.awssdk.services.s3.model DeleteObjectRequest GetObjectRequest NoSuchKeyException PutObjectRequest)
   (software.amazon.awssdk.services.s3.presigner S3Presigner S3Presigner$Builder)
   (software.amazon.awssdk.services.s3.presigner.model GetObjectPresignRequest PresignedGetObjectRequest PresignedPutObjectRequest PutObjectPresignRequest)))

(set! *warn-on-reflection* true)

(defn- safe-delete
  "Safely delete a file."
  [^File file]
  (try (.delete file) (catch Exception _)))

(defn- write-to-stream! [^OutputStream os col-names reducible-rows]
  (let [writer (-> os
                   (OutputStreamWriter. StandardCharsets/UTF_8)
                   (BufferedWriter.))]

    (run! (fn [row]
            (let [row-map (zipmap col-names row)]
              (json/encode-to row-map writer {})
              (.newLine writer)))
          reducible-rows)

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

(defn- root-type
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Float
           :type/Integer
           :type/Boolean
           :type/DateTimeWithTZ
           :type/DateTime
           :type/Dictionary
           :type/JSON
           :type/Date
           :type/Text])))

(defn- closest-ancestor [t pred]
  (loop [remaining (conj clojure.lang.PersistentQueue/EMPTY [t])]
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
  {:version        "0.1.0"
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

(defn- maybe-fixup-v [col v]
  ;; clickhouse returns bigdecimals for int64 values
  (if (and (isa? (:base_type col) :type/Integer)
           (or (instance? BigDecimal v)
               (float? v)))
    (bigint v)
    v))

(defn- write-table-data-to-file! [id temp-file cancel-chan]
  (let [db-id           (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver          (t2/select-one-fn :engine :model/Database db-id)
        all-fields-meta (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position :nfc_path :parent_id]
                                   :table_id id
                                   :active true
                                   {:order-by [[:database_position :asc]]})
        fields-meta (filter #(and (nil? (:parent_id %)) (nil? (:nfc_path %))) all-fields-meta)
        query {:source-table id}
        manifest (generate-manifest id fields-meta)]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream temp-file)]
                            (let [filtered-col-meta (m/index-by :name fields-meta)
                                  filtered-cols (filter #(contains? filtered-col-meta (:name %)) cols-meta)
                                  col-name->index (into {} (map-indexed (fn [i col] [(:name col) i]) cols-meta))
                                  filtered-indices (mapv (fn [col] [(col-name->index (:name col)) col]) filtered-cols)
                                  filtered-rows (eduction (map (fn [row] (mapv (fn [[idx col]]
                                                                                 (let [v (nth row idx)]
                                                                                   (maybe-fixup-v col v))) filtered-indices)))
                                                          reducible-rows)]
                              (write-to-stream! os (mapv :name filtered-cols) filtered-rows))))
                        cancel-chan)
    manifest))

(defn- maybe-with-endpoint-s3-client [^S3ClientBuilder builder endpoint]
  (let [region (transforms.settings/python-storage-s-3-region)]
    (case [(some? endpoint) (some? region)]
      [true true]   (doto builder
                      (.endpointOverride (URI/create endpoint))
                      (.region (Region/of region)))
      [true false]  (log/warn "Ignoring endpoint because region is not defined")
      [false true]  (.region builder (Region/of region))
      [false false] builder)))

(defn- maybe-with-endpoint-s3-presigner [^S3Presigner$Builder builder endpoint]
  (let [region (transforms.settings/python-storage-s-3-region)]
    (case [(some? endpoint) (some? region)]
      [true true]   (doto builder
                      (.endpointOverride (URI/create endpoint))
                      (.region (Region/of region)))
      [true false]  (log/warn "Ignoring endpoint because region is not defined")
      [false true]  (.region builder (Region/of region))
      [false false] (.region builder (Region/US_EAST_1)))))

(defn- create-s3-configuration
  "Create S3Configuration with path-style access setting"
  ^S3Configuration []
  (-> (S3Configuration/builder)
      (.pathStyleAccessEnabled (transforms.settings/python-storage-s-3-path-style-access))
      (.build)))

(defn- build-put-object-request
  "Build a PutObjectRequest with bucket and key"
  [^String bucket-name ^String key]
  (-> (PutObjectRequest/builder)
      (.bucket bucket-name)
      (.key key)
      (.build)))

(defn- build-get-object-request
  "Build a GetObjectRequest with bucket and key"
  [^String bucket-name ^String key]
  (-> (GetObjectRequest/builder)
      (.bucket bucket-name)
      (.key key)
      (.build)))

(defn- build-delete-object-request
  "Build a DeleteObjectRequest with bucket and key"
  [^String bucket-name ^String key]
  (-> (DeleteObjectRequest/builder)
      (.bucket bucket-name)
      (.key key)
      (.build)))

(def ^:private ^Duration presigned-url-duration
  "Default duration for presigned URLs"
  (Duration/ofHours 1))

(defn- maybe-with-credentials-s3-client [^S3ClientBuilder builder]
  (let [access-key (transforms.settings/python-storage-s-3-access-key)
        secret-key (transforms.settings/python-storage-s-3-secret-key)]
    (if (or access-key secret-key)
      (if-not (and access-key secret-key)
        (do (log/warnf "Ignoring %s because %s is not defined"
                       (if access-key "access-key" "secret-key")
                       (if (not access-key) "access-key" "secret-key"))
            (.credentialsProvider builder (DefaultCredentialsProvider/create)))
        (.credentialsProvider builder
                              (StaticCredentialsProvider/create
                               (AwsBasicCredentials/create access-key secret-key))))
      (.credentialsProvider builder (DefaultCredentialsProvider/create)))))

(defn- maybe-with-credentials-s3-presigner [^S3Presigner$Builder builder]
  (let [access-key (transforms.settings/python-storage-s-3-access-key)
        secret-key (transforms.settings/python-storage-s-3-secret-key)]
    (if (or access-key secret-key)
      (if-not (and access-key secret-key)
        (do (log/warnf "Ignoring %s because %s is not defined"
                       (if access-key "access-key" "secret-key")
                       (if (not access-key) "access-key" "secret-key"))
            builder)
        (.credentialsProvider builder
                              (StaticCredentialsProvider/create
                               (AwsBasicCredentials/create access-key secret-key))))
      builder)))

;; We just recreate the client every time, to keep things simple if config is changed.
(defn- create-s3-client
  "Create S3 client for host operations (uploads, reads)"
  ^S3Client []
  (let [^S3ClientBuilder builder (S3Client/builder)]
    (doto builder
      (maybe-with-endpoint-s3-client (transforms.settings/python-storage-s-3-endpoint))
      maybe-with-credentials-s3-client
      (.serviceConfiguration (create-s3-configuration)))
    (.build builder)))

(defn- create-s3-presigner-for-container
  "Create S3 presigner for container operations (presigned URLs).
  Uses container-endpoint if different from host endpoint."
  ^S3Presigner []
  (let [container-endpoint (transforms.settings/python-storage-s-3-container-endpoint)
        builder (S3Presigner/builder)]
    (doto builder
      (maybe-with-endpoint-s3-presigner (or container-endpoint (transforms.settings/python-storage-s-3-endpoint)))
      maybe-with-credentials-s3-presigner
      (.serviceConfiguration (create-s3-configuration)))
    (.build builder)))

(defn- upload-file-to-s3
  "Upload file using host client"
  [^S3Client s3-client ^String bucket-name ^String key ^File file]
  (let [^PutObjectRequest request (build-put-object-request bucket-name key)]
    (.putObject s3-client request (RequestBody/fromFile file))))

(defn- generate-presigned-get-url
  "Generate GET URL using container presigner"
  [^S3Presigner presigner ^String bucket-name ^String key]
  (let [^GetObjectRequest get-request (build-get-object-request bucket-name key)
        ^GetObjectPresignRequest presign-request (-> (GetObjectPresignRequest/builder)
                                                     (.signatureDuration presigned-url-duration)
                                                     (.getObjectRequest get-request)
                                                     (.build))
        presigned ^PresignedGetObjectRequest (.presignGetObject presigner presign-request)]
    (.toString (.url presigned))))

(defn- generate-presigned-put-url
  "Generate PUT URL using container presigner"
  [^S3Presigner presigner ^String bucket-name ^String key]
  (let [^PutObjectRequest put-request (build-put-object-request bucket-name key)
        ^PutObjectPresignRequest presign-request (-> (PutObjectPresignRequest/builder)
                                                     (.signatureDuration presigned-url-duration)
                                                     (.putObjectRequest put-request)
                                                     (.build))
        presigned ^PresignedPutObjectRequest (.presignPutObject presigner presign-request)]
    (.toString (.url presigned))))

(defn- delete-s3-object [^S3Client s3-client ^String bucket-name ^String key]
  (try
    (let [^DeleteObjectRequest request (build-delete-object-request bucket-name key)]
      (.deleteObject s3-client request))
    (catch Exception e
      (log/debugf e "Error deleting s3 object %s" key)
      ;; Ignore deletion errors - object might not exist, or we might not have permissions
      ;; NOTE: we plan to put general retention on the bucket so that objects will eventually be deleted
      nil)))

(defn- cleanup-s3-objects [^S3Client s3-client bucket-name s3-keys]
  (run! (partial delete-s3-object s3-client bucket-name) s3-keys))

(defn- read-from-s3
  ([s3-client bucket-name key] (read-from-s3 s3-client bucket-name key ::throw))
  ([^S3Client s3-client ^String bucket-name ^String key not-found]
   (try
     (let [^GetObjectRequest request (build-get-object-request bucket-name key)
           response                  (.getObject s3-client request)]
       (slurp response))
     (catch NoSuchKeyException e
       (if (identical? ::throw not-found)
         (throw e)
         not-found)))))

(defn get-logs
  "Return the logs of the current running python process"
  [run-id]
  (let [server-url (transforms.settings/python-execution-server-url)]
    (http/get (str server-url "/logs")
              {:content-type     :json
               :accept           :json
               :throw-exceptions false
               :as               :json
               :query-params     {:request_id run-id}})))

(defn- s3-shared-storage [table-name->id]
  (let [prefix              (some-> (transforms.settings/python-storage-s-3-prefix) (str "/"))
        work-dir-name       (str prefix "run-" (System/nanoTime) "-" (rand-int 10000))
        container-presigner (create-s3-presigner-for-container)
        bucket-name         (transforms.settings/python-storage-s-3-bucket)
        loc
        (fn [method relative-path]
          ;; save a tracking root to a well known location
          ;; later can ls these to collect those objects whose ttl has elapsed
          ;; (OR setup a retention policy in s3?)
          (let [path (str work-dir-name "/" relative-path)]
            {:path   path
             :method method
             :url    (case method :put (generate-presigned-put-url container-presigner bucket-name path)
                           :get (generate-presigned-get-url container-presigner bucket-name path))}))]
    {:s3-client   (create-s3-client)                        ;; do not like mixing interactive things with descriptions, but its damn convenient to have it here for now
     :bucket-name bucket-name
     :objects
     (into
      {:output          (loc :put "output.csv")
       :output-manifest (loc :put "output-manifest.json")
       :events          (loc :put "events.jsonl")}
      (for [[table-name id] table-name->id]
        {[:table id :manifest] (loc :get (str "-table-" (name table-name) "-" id ".manifest.json"))
         [:table id :data]     (loc :get (str "-table-" (name table-name) "-" id ".jsonl"))}))}))

(defn open-s3-shared-storage!
  "Returns a deref'able shared storage value, (.close) will optimistically delete any s3 objects named in storage (data files for tables, metadata files etc).
  The intention is the bucket specifies a generic object retention policy to ensure objects are eventually deleted (e.g. because the process dies during writing and .close never gets called)"
  ^Closeable [table-name->id]
  (let [shared-storage (s3-shared-storage table-name->id)]
    (reify IDeref
      (deref [_] shared-storage)
      Closeable
      (close [_] (cleanup-s3-objects (:s3-client shared-storage) (:bucket-name shared-storage) (map :path (vals (:objects shared-storage))))))))

(defn copy-tables-to-s3!
  "Writes table content to their corresponding objects named in shared-storage, see (open-shared-storage!).
  Blocks until all tables are fully written and committed to shared storage."
  [{:keys [run-id
           shared-storage
           table-name->id
           cancel-chan]}]
  (doseq [id (vals table-name->id)
          :let [{:keys [s3-client bucket-name objects]} shared-storage
                {data-path :path}     (get objects [:table id :data])
                {manifest-path :path} (get objects [:table id :manifest])]]
    (let [temp-file       (File/createTempFile data-path "")
          manifest-file   (File/createTempFile manifest-path "")]
      (try
        ;; Write table data to temporary file and get manifest
        (let [manifest (transforms.instrumentation/with-stage-timing [run-id :data-transfer :dwh-to-file]
                         (write-table-data-to-file! id temp-file cancel-chan))]
          ;; Write manifest to file
          (with-open [writer (io/writer manifest-file)]
            (json/encode-to manifest writer {}))
          (let [file-size (.length temp-file)
                manifest-size (.length manifest-file)]
            (transforms.instrumentation/record-data-transfer! run-id :dwh-to-file file-size nil)

            ;; Upload both files to S3
            (transforms.instrumentation/with-stage-timing [run-id :data-transfer :file-to-s3]
              (upload-file-to-s3 s3-client bucket-name data-path temp-file)
              (upload-file-to-s3 s3-client bucket-name manifest-path manifest-file))

            (transforms.instrumentation/record-data-transfer! run-id :file-to-s3 (+ file-size manifest-size) nil)))
        (finally
          ;; Clean up temporary files
          (safe-delete temp-file)
          (safe-delete manifest-file))))))

(defn execute-python-code-http-call!
  "Calls the /execute endpoint of the python runner. Blocks until the run either succeeds or fails and returns
  the response from the server."
  [{:keys [server-url code run-id table-name->id shared-storage]}]
  (let [{:keys [objects]} shared-storage
        {:keys [output output-manifest events]} objects

        table-name->url          (update-vals table-name->id (comp :url #(get objects [:table % :data])))
        table-name->manifest-url (update-vals table-name->id (comp :url #(get objects [:table % :manifest])))

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
                                   (http/post (str server-url "/execute")
                                              {:content-type     :json
                                               :accept           :json
                                               :body             (json/encode payload)
                                               :throw-exceptions false
                                               :as               :json}))]
    ;; when a 500 is returned we observe a string in the body (despite the python returning json)
    ;; always try to parse the returned string as json before yielding (could tighten this up at some point)
    (update response :body (fn [string-if-error]
                             (if (string? string-if-error)
                               (try
                                 (json/decode+kw string-if-error)
                                 (catch Exception _
                                   {:error string-if-error}))
                               string-if-error)))))

(defn open-cancellation-process!
  "Starts a core.async process that optimistically sends a cancellation request to the python executor if cancel-chan receives a value.
  Returns a channel that will receive either the async http call j.u.c.FutureTask in the case of cancellation, or nil when the cancel-chan is closed."
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (http/post (str server-url "/cancel")
                     {:content-type :json
                      :body         (json/encode {:request_id run-id})
                      :async?       true}
                     identity identity))))

;; temporary, we should not need to realize data/events files into memory longer term
(defn read-output-objects
  "Temporary function that strings/jsons stuff in S3 and returns it for compatibility."
  [{:keys [s3-client bucket-name objects]}]
  (let [{:keys [output output-manifest events]} objects
        output-content          (read-from-s3 s3-client bucket-name (:path output) nil)
        output-manifest-content (read-from-s3 s3-client bucket-name (:path output-manifest) "{}")
        events-content          (read-from-s3 s3-client bucket-name (:path events))]
    {:output output-content
     :output-manifest (json/decode+kw output-manifest-content)
     :events (mapv json/decode+kw (str/split-lines events-content))}))
