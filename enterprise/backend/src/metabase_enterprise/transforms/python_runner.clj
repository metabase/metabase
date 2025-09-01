(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (com.amazonaws.auth BasicAWSCredentials)
   (com.amazonaws.client.builder AwsClientBuilder$EndpointConfiguration)
   (com.amazonaws.services.s3 AmazonS3ClientBuilder)
   (com.amazonaws.services.s3.model GeneratePresignedUrlRequest PutObjectRequest)
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

(defn- write-table-data-to-file! [id temp-file cancel-chan]
  (let [db-id  (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query  {:source-table id}]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream temp-file)]
                            (write-to-stream! os (mapv :name cols-meta) reducible-rows)))
                        cancel-chan)))

(defn- create-s3-client ^com.amazonaws.services.s3.AmazonS3 []
  (let [config (transforms.settings/python-storage-config)
        builder (AmazonS3ClientBuilder/standard)]
    (doto ^com.amazonaws.services.s3.AmazonS3ClientBuilder builder
      (.withEndpointConfiguration
       (AwsClientBuilder$EndpointConfiguration. (:endpoint config) (:region config)))
      (.withCredentials
       (reify com.amazonaws.auth.AWSCredentialsProvider
         (getCredentials [_]
           (BasicAWSCredentials. (:access-key-id config) (:secret-access-key config)))
         (refresh [_])))
      (.withPathStyleAccessEnabled (:path-style-access config)))
    (.build ^com.amazonaws.services.s3.AmazonS3ClientBuilder builder)))

(defn- fix-s3-url-for-container [url config]
  (if-let [container-endpoint (:container-endpoint config)]
    (str/replace url (:endpoint config) container-endpoint)
    url))

(defn- generate-presigned-url [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key method config]
  (let [one-hour    (* 60 60 1000)
        expiration  (Date. ^Long (+ (System/currentTimeMillis) one-hour))
        url-request (-> (GeneratePresignedUrlRequest. bucket-name key)
                        (.withExpiration expiration)
                        (.withMethod method))]
    (-> (.generatePresignedUrl s3-client url-request)
        (.toString)
        (fix-s3-url-for-container config))))

(defn- upload-file-to-s3-and-get-url [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key ^File file config]
  (let [put-request (PutObjectRequest. ^String bucket-name ^String key file)]
    (.putObject s3-client put-request)
    (generate-presigned-url s3-client bucket-name key com.amazonaws.HttpMethod/GET config)))

(defn- generate-presigned-put-url [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key config]
  (generate-presigned-url s3-client bucket-name key com.amazonaws.HttpMethod/PUT config))

(defn- delete-s3-object [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key]
  (try
    (.deleteObject s3-client ^String bucket-name ^String key)
    (catch Exception _
      ;; Ignore deletion errors - object might not exist or we might not have permissions
      nil)))

(defn- cleanup-s3-objects [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name s3-keys]
  (run! (partial delete-s3-object s3-client bucket-name) s3-keys))

(defn- read-from-s3 [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key]
  (try
    (let [object (.getObject s3-client ^String bucket-name ^String key)]
      (slurp (.getObjectContent object)))
    (catch com.amazonaws.services.s3.model.AmazonS3Exception e
      (if (= 404 (.getStatusCode e))
        ""
        (throw e)))))

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [run-id code table-name->id cancel-chan]
  (let [work-dir-name (str "run-" (System/currentTimeMillis) "-" (rand-int 10000))]

    (try
      (let [server-url      (transforms.settings/python-execution-server-url)
            storage-config  (transforms.settings/python-storage-config)
            s3-client       (create-s3-client)
            bucket-name     (:bucket storage-config)
            ;; Generate S3 keys for output files
            output-key      (str work-dir-name "/output.csv")
            stdout-key      (str work-dir-name "/stdout.txt")
            stderr-key      (str work-dir-name "/stderr.txt")
            ;; Generate presigned URLs for writing
            output-url      (generate-presigned-put-url s3-client bucket-name output-key storage-config)
            stdout-url      (generate-presigned-put-url s3-client bucket-name stdout-key storage-config)
            stderr-url      (generate-presigned-put-url s3-client bucket-name stderr-key storage-config)
            ;; Upload input table data (write to disk first, then upload to S3)
            table-results   (for [[table-name id] table-name->id]
                              (let [temp-file (File/createTempFile
                                               (str work-dir-name "-table-" (name table-name) "-" id)
                                               ".jsonl")
                                    s3-key (str work-dir-name "/" (.getName temp-file))]
                                (try
                                  ;; Write table data to temporary file (closes DB connection quickly)
                                  (write-table-data-to-file! id temp-file cancel-chan)
                                  ;; Upload file to S3 and get URL
                                  (let [url (upload-file-to-s3-and-get-url s3-client bucket-name s3-key temp-file storage-config)]
                                    {:table-name (name table-name)
                                     :url        url
                                     :s3-key     s3-key})
                                  (finally
                                    ;; Clean up temporary file
                                    (safe-delete temp-file)))))
            table-name->url (into {} (map (juxt :table-name :url) table-results))
            all-s3-keys     (concat [output-key stdout-key stderr-key] (map :s3-key table-results))
            canc            (a/go (when (a/<! cancel-chan)
                                    (http/post (str server-url "/cancel")
                                               {:content-type :json
                                                :body         (json/encode {:request_id run-id})
                                                :async?       true}
                                               identity identity)))
            response        (http/post (str server-url "/execute")
                                       {:content-type     :json
                                        :accept           :json
                                        :body             (json/encode {:code          code
                                                                        :timeout       30
                                                                        :request_id    run-id
                                                                        :output_url    output-url
                                                                        :stdout_url    stdout-url
                                                                        :stderr_url    stderr-url
                                                                        :table_mapping table-name->url})
                                        :throw-exceptions false
                                        :as               :json})
            _               (a/close! canc)

            result (:body response)
            ;; TODO look into why some tests return json and others strings
            result (if (string? result) (json/decode result keyword) result)]

        (try
          (if (and (= 200 (:status response))
                   (zero? (:exit_code result)))
            ;; Success - read the output from S3
            (let [output-content (read-from-s3 s3-client bucket-name output-key)
                  stdout-content (read-from-s3 s3-client bucket-name stdout-key)
                  stderr-content (read-from-s3 s3-client bucket-name stderr-key)]
              (if (not (str/blank? output-content))
                {:status 200
                 :body   {:output output-content
                          :stdout stdout-content
                          :stderr stderr-content}}
                {:status 500
                 :body   {:error  "Transform did not produce output CSV"
                          :stdout stdout-content
                          :stderr stderr-content}}))
            ;; Error from execution server - read stderr/stdout from S3
            (let [stdout-content (read-from-s3 s3-client bucket-name stdout-key)
                  stderr-content (read-from-s3 s3-client bucket-name stderr-key)]
              {:status 500
               :body
               {:error     (or (:error result) "Execution failed")
                :exit-code (:exit_code result)
                :timeout   (:timeout result)
                :stdout    stdout-content
                :stderr    stderr-content}}))
          (finally
            ;; Clean up S3 objects
            (try
              (cleanup-s3-objects s3-client bucket-name all-s3-keys)
              (catch Exception _)))))

      (catch CancellationException _
        {:status 408
         :body   {:error "Interrupted"}})

      (catch Exception e
        {:status 500
         :body   {:error (str "Failed to connect to Python execution server: " (.getMessage e))}}))))
