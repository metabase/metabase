(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter File OutputStream OutputStreamWriter)
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.time Duration)
   (java.util.concurrent CancellationException)
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
        (driver/execute-reducible-query driver query {:canceled-chan cancel-chan} respond)))))

(defn- root-type
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Float
           :type/Integer
           :type/Boolean
           :type/DateTimeWithTZ
           :type/DateTime
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
                            #_#_:field_id   (:id col-meta)})
                         cols-meta)
   :table_metadata {:table_id table-id}})

(defn- write-table-data-to-file! [id temp-file cancel-chan]
  (let [db-id         (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver        (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query         {:source-table id}
        manifest-atom (atom nil)]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (reset! manifest-atom (generate-manifest id cols-meta))
                          (with-open [os (io/output-stream temp-file)]
                            (write-to-stream! os (mapv :name cols-meta) reducible-rows)))
                        cancel-chan)
    @manifest-atom))

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
    (catch Exception _
      ;; Ignore deletion errors - object might not exist or we might not have permissions
      nil)))

(defn- cleanup-s3-objects [^S3Client s3-client bucket-name s3-keys]
  (run! (partial delete-s3-object s3-client bucket-name) s3-keys))

(defn- read-from-s3 [^S3Client s3-client ^String bucket-name ^String key & [fallback-content]]
  (try
    (let [^GetObjectRequest request (build-get-object-request bucket-name key)
          response                  (.getObject s3-client request)]
      (slurp response))
    (catch NoSuchKeyException e
      (if fallback-content
        fallback-content
        (throw e)))))

(defn get-logs
  "Return the logs of the current running python process"
  ;; TODO: we should be given an id for the expected job, se we don't return unrelated logs
  ;;       if the job has already finished, we could fethc the logs from the db instead
  [run-id]
  (let [server-url (transforms.settings/python-execution-server-url)]
    (http/get (str server-url "/logs")
              {:content-type     :json
               :accept           :json
               :throw-exceptions false
               :as               :json
               :query-params     {:request_id run-id}})))

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [run-id code table-name->id cancel-chan]
  (let [prefix        (some-> (transforms.settings/python-storage-s-3-prefix) (str "/"))
        work-dir-name (str prefix "run-" (System/nanoTime) "-" (rand-int 10000))]

    (try
      (let [server-url               (transforms.settings/python-execution-server-url)
            bucket-name              (transforms.settings/python-storage-s-3-bucket)
            s3-client                (create-s3-client)
            container-presigner      (create-s3-presigner-for-container)

            ;; Generate S3 keys for output files
            output-key               (str work-dir-name "/output.csv")
            output-manifest-key      (str work-dir-name "/output.manifest.json")
            events-key               (str work-dir-name "/events.jsonl")
            ;; Generate presigned URLs for writing (using container client)
            output-url               (generate-presigned-put-url container-presigner bucket-name output-key)
            output-manifest-url      (generate-presigned-put-url container-presigner bucket-name output-manifest-key)
            events-url               (generate-presigned-put-url container-presigner bucket-name events-key)
            ;; Upload input table data (write to disk first, then upload to S3)
            table-results            (for [[table-name id] table-name->id]
                                       (let [temp-file       (File/createTempFile
                                                              (str work-dir-name "-table-" (name table-name) "-" id)
                                                              ".jsonl")
                                             manifest-file   (File/createTempFile
                                                              (str work-dir-name "-table-" (name table-name) "-" id)
                                                              ".manifest.json")
                                             s3-key          (str work-dir-name "/" (.getName temp-file))
                                             manifest-s3-key (str work-dir-name "/" (.getName manifest-file))]
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
                                                 (upload-file-to-s3 s3-client bucket-name s3-key temp-file)
                                                 (upload-file-to-s3 s3-client bucket-name manifest-s3-key manifest-file))

                                               (let [data-url     (generate-presigned-get-url container-presigner bucket-name s3-key)
                                                     manifest-url (generate-presigned-get-url container-presigner bucket-name manifest-s3-key)]
                                                 (transforms.instrumentation/record-data-transfer! run-id :file-to-s3 (+ file-size manifest-size) nil)
                                                 {:table-name      (name table-name)
                                                  :url             data-url
                                                  :manifest-url    manifest-url
                                                  :s3-key          s3-key
                                                  :manifest-s3-key manifest-s3-key})))
                                           (finally
                                             ;; Clean up temporary files
                                             (safe-delete temp-file)
                                             (safe-delete manifest-file)))))
            table-name->url          (into {} (map (juxt :table-name :url) table-results))
            table-name->manifest-url (into {} (map (juxt :table-name :manifest-url) table-results))
            all-s3-keys              (concat [output-key output-manifest-key events-key]
                                             (map :s3-key table-results)
                                             (map :manifest-s3-key table-results))
            canc                     (a/go (when (a/<! cancel-chan)
                                             (http/post (str server-url "/cancel")
                                                        {:content-type :json
                                                         :body         (json/encode {:request_id run-id})
                                                         :async?       true}
                                                        identity identity)))
            payload                  {:code                code
                                      :timeout             30
                                      :request_id          run-id
                                      :output_url          output-url
                                      :output_manifest_url output-manifest-url
                                      :events_url          events-url
                                      :table_mapping       table-name->url
                                      :manifest_mapping    table-name->manifest-url}
            response                 (http/post (str server-url "/execute")
                                                {:content-type     :json
                                                 :accept           :json
                                                 :body             (json/encode payload)
                                                 :throw-exceptions false
                                                 :as               :json})
            _                        (a/close! canc)

            result                   (:body response)
            ;; TODO look into why some tests return json and others strings
            result                   (if (string? result) (json/decode result keyword) result)]

        (try
          (if (and (= 200 (:status response))
                   (zero? (:exit_code result)))
           ;; Success - read the output from S3
            (let [output-content  (read-from-s3 s3-client bucket-name output-key)
                  output-manifest (read-from-s3 s3-client bucket-name output-manifest-key "{}")
                  events-content  (read-from-s3 s3-client bucket-name events-key "[]")]
              (if (not (str/blank? output-content))
                {:status 200
                 :body   {:output output-content
                          :metadata output-manifest
                          :events (mapv json/decode+kw (str/split-lines events-content))}}
                {:status 500
                 :body   {:error  "Transform did not produce output CSV"
                          :events (mapv json/decode+kw (str/split-lines events-content))}}))
           ;; Error from execution server - read events .jsonl (including stderr/stdout) from S3
            (let [events-content (read-from-s3 s3-client bucket-name events-key "[]")]
              {:status 500
               :body
               {:error       (or (:error result) "Execution failed")
                :exit-code   (:exit_code result)
                :status-code (:status response)
                :timeout     (:timeout result)
                :events      (mapv json/decode+kw (str/split-lines events-content))}}))
          (finally
            ;; Clean up S3 objects
            (try
              (cleanup-s3-objects s3-client bucket-name all-s3-keys)
              (catch Exception _)))))

      (catch CancellationException _
        {:status 408
         :body   {:error "Interrupted"}})

      (catch Exception e
        (.printStackTrace e)
        {:status 500
         :body   {:error (str "Failed to connect to Python execution server: " (.getMessage e))}}))))
