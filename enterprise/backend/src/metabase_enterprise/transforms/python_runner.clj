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
   (com.amazonaws HttpMethod)
   (com.amazonaws.auth AWSCredentialsProvider BasicAWSCredentials)
   (com.amazonaws.client.builder AwsClientBuilder$EndpointConfiguration)
   (com.amazonaws.services.s3 AmazonS3 AmazonS3ClientBuilder)
   (com.amazonaws.services.s3.model AmazonS3Exception GeneratePresignedUrlRequest PutObjectRequest)
   (java.io BufferedWriter File OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util Date)
   (java.util.concurrent CancellationException)))

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

(defn- generate-manifest
  "Generate a metadata manifest for the table columns."
  [table-id cols-meta]
  {:version        "0.1.0"
   :fields         (mapv (fn [col-meta]
                           {:name           (:name col-meta)
                            :database_type  (when (:base_type col-meta)
                                              (str (:base_type col-meta)))
                            :semantic_type  (when (:semantic_type col-meta)
                                              (str (:semantic_type col-meta)))
                            :effective_type (when (:effective_type col-meta)
                                              (str (:effective_type col-meta)))
                            :field_id       (:id col-meta)})
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

(defn- maybe-with-endpoint [^AmazonS3ClientBuilder builder endpoint]
  (let [region (transforms.settings/python-storage-s-3-region)]
    (case [(some? endpoint) (some? region)]
      [true true]   (.withEndpointConfiguration builder (AwsClientBuilder$EndpointConfiguration. endpoint region))
      [true false]  (log/warn "Ignoring endpoint because region is not defined")
      [false true]  (.withRegion builder ^String region)
      [false false] :nothing-to-do)))

(defn- maybe-with-credentials [^AmazonS3ClientBuilder builder]
  (let [access-key (transforms.settings/python-storage-s-3-access-key)
        secret-key (transforms.settings/python-storage-s-3-secret-key)]
    (when (or access-key secret-key)
      (if-not (and access-key secret-key)
        (log/warnf "Ignoring %s because %s is not defined"
                   (if access-key "access-key" "secret-key")
                   (if (not access-key) "access-key" "secret-key"))
        (doto builder
          (.withCredentials
           (reify AWSCredentialsProvider
             (getCredentials [_] (BasicAWSCredentials. access-key secret-key))
             (refresh [_]))))))))

;; We just recreate the client every time, to keep things simple if config is changed.
(defn- create-s3-client
  "Create S3 client for host operations (uploads, reads)"
  ^AmazonS3 []
  (let [builder (AmazonS3ClientBuilder/standard)]
    (doto ^AmazonS3ClientBuilder builder
      (maybe-with-endpoint (transforms.settings/python-storage-s-3-endpoint))
      maybe-with-credentials
      (.withPathStyleAccessEnabled (transforms.settings/python-storage-s-3-path-style-access)))
    (.build ^AmazonS3ClientBuilder builder)))

(defn- create-s3-client-for-container
  "Create S3 client for container operations (presigned URLs).
   Uses container-endpoint if different from host endpoint, otherwise reuses host client."
  ^AmazonS3 [^AmazonS3 host-client]
  (let [container-endpoint (transforms.settings/python-storage-s-3-container-endpoint)
        host-endpoint      (transforms.settings/python-storage-s-3-endpoint)
        path-style-access? (transforms.settings/python-storage-s-3-path-style-access)]
    (if (= container-endpoint host-endpoint)
      ;; Use the same client if endpoints are the same
      host-client
      ;; Create a separate client to sign modified links that the container can use
      (.build
       (doto ^AmazonS3ClientBuilder (AmazonS3ClientBuilder/standard)
         (maybe-with-endpoint container-endpoint)
         maybe-with-credentials
         (.withPathStyleAccessEnabled path-style-access?))))))

(defn- generate-presigned-url*
  "Generate presigned URL using the provided S3 client"
  [^AmazonS3 s3-client bucket-name key method]
  (let [one-hour    (* 60 60 1000)
        expiration  (Date. ^Long (+ (System/currentTimeMillis) one-hour))
        url-request (-> (GeneratePresignedUrlRequest. bucket-name key)
                        (.withExpiration expiration)
                        (.withMethod method))]
    (.toString (.generatePresignedUrl s3-client url-request))))

(defn- upload-file-to-s3
  "Upload file using host client, return GET URL using container client"
  [^AmazonS3 s3-client ^String bucket-name ^String key ^File file]
  (.putObject s3-client (PutObjectRequest. bucket-name key file)))

(defn- generate-presigned-get-url
  "Generate GET URL using container client"
  [^AmazonS3 container-s3-client bucket-name key]
  (generate-presigned-url* container-s3-client bucket-name key HttpMethod/GET))

(defn- generate-presigned-put-url
  "Generate PUT URL using container client"
  [^AmazonS3 container-s3-client bucket-name key]
  (generate-presigned-url* container-s3-client bucket-name key HttpMethod/PUT))

(defn- delete-s3-object [^AmazonS3 s3-client bucket-name key]
  (try
    (.deleteObject s3-client ^String bucket-name ^String key)
    (catch Exception _
      ;; Ignore deletion errors - object might not exist or we might not have permissions
      nil)))

(defn- cleanup-s3-objects [^AmazonS3 s3-client bucket-name s3-keys]
  (run! (partial delete-s3-object s3-client bucket-name) s3-keys))

(defn- read-from-s3 [^AmazonS3 s3-client bucket-name key & [fallback-content]]
  (try
    (let [object (.getObject s3-client ^String bucket-name ^String key)]
      (slurp (.getObjectContent object)))
    (catch AmazonS3Exception e
      (if (and (= 404 (.getStatusCode e)) fallback-content)
        fallback-content
        (throw e)))))

(defn get-logs
  "Return the logs of the current running python process"
  ;; TODO: we should be given an id for the expected job, se we don't return unrelated logs
  ;;       if the job has already finished, we could fethc the logs from the db instead
  []
  (let [server-url (transforms.settings/python-execution-server-url)]
    (http/get (str server-url "/logs")
              {:content-type     :json
               :accept           :json
               :throw-exceptions false
               :as               :json})))

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [run-id code table-name->id cancel-chan]
  (let [prefix        (some-> (transforms.settings/python-storage-s-3-prefix) (str "/"))
        work-dir-name (str prefix "run-" (System/nanoTime) "-" (rand-int 10000))]

    (try
      (let [server-url               (transforms.settings/python-execution-server-url)
            bucket-name              (transforms.settings/python-storage-s-3-bucket)
            s3-client                (create-s3-client)
            container-s3-client      (create-s3-client-for-container s3-client)

            ;; Generate S3 keys for output files
            output-key               (str work-dir-name "/output.csv")
            output-manifest-key      (str work-dir-name "/output.manifest.json")
            stdout-key               (str work-dir-name "/stdout.txt")
            stderr-key               (str work-dir-name "/stderr.txt")
            ;; Generate presigned URLs for writing (using container client)
            output-url               (generate-presigned-put-url container-s3-client bucket-name output-key)
            output-manifest-url      (generate-presigned-put-url container-s3-client bucket-name output-manifest-key)
            stdout-url               (generate-presigned-put-url container-s3-client bucket-name stdout-key)
            stderr-url               (generate-presigned-put-url container-s3-client bucket-name stderr-key)
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

                                               (let [data-url     (generate-presigned-get-url container-s3-client bucket-name s3-key)
                                                     manifest-url (generate-presigned-get-url container-s3-client bucket-name manifest-s3-key)]
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
            all-s3-keys              (concat [output-key output-manifest-key stdout-key stderr-key]
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
                                      :stdout_url          stdout-url
                                      :stderr_url          stderr-url
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
            (let [output-content (read-from-s3 s3-client bucket-name output-key)
                  output-manifest (read-from-s3 s3-client bucket-name output-manifest-key)
                  stdout-content (read-from-s3 s3-client bucket-name stdout-key "stdout missing")
                  stderr-content (read-from-s3 s3-client bucket-name stderr-key "stderr missing")]
              (if (not (str/blank? output-content))
                {:status 200
                 :body   {:output output-content
                          :metadata output-manifest
                          :stdout stdout-content
                          :stderr stderr-content}}
                {:status 500
                 :body   {:error  "Transform did not produce output CSV"
                          :stdout stdout-content
                          :stderr stderr-content}}))
            ;; Error from execution server - read stderr/stdout from S3
            (let [stdout-content (read-from-s3 s3-client bucket-name stdout-key "stdout missing")
                  stderr-content (read-from-s3 s3-client bucket-name stderr-key "stderr missing")]
              {:status 500
               :body
               {:error       (or (:error result) "Execution failed")
                :exit-code   (:exit_code result)
                :status-code (:status response)
                :timeout     (:timeout result)
                :stdout      stdout-content
                :stderr      stderr-content}}))
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
