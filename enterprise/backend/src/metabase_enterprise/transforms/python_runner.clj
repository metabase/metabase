(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
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
   (com.amazonaws.services.s3 AmazonS3 AmazonS3ClientBuilder)
   (com.amazonaws.services.s3.model GeneratePresignedUrlRequest ObjectMetadata PutObjectRequest)
   (java.io BufferedWriter ByteArrayInputStream ByteArrayOutputStream File OutputStream OutputStreamWriter)
   (java.net URL)
   (java.nio.charset StandardCharsets)
   (java.util Date)
   (java.util.concurrent CancellationException)))

(set! *warn-on-reflection* true)

(defn- safe-slurp
  "Safely slurp a file, returning empty string on error."
  [file]
  (try (slurp file) (catch Exception _ "")))

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

          query {:database db-id
                 :type :native
                 :native native}]
      (qp.store/with-metadata-provider db-id
        (driver/execute-reducible-query driver query {:canceled-chan cancel-chan} respond)))))

(defn- write-table-data! [id file cancel-chan]
  (let [db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query {:source-table id}]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream file)]
                            (write-to-stream! os (mapv :name cols-meta) reducible-rows)))
                        cancel-chan)))

(defn- write-table-data-to-stream! [id cancel-chan]
  (let [db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query {:source-table id}
        baos (ByteArrayOutputStream.)]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (write-to-stream! baos (mapv :name cols-meta) reducible-rows))
                        cancel-chan)
    (.toByteArray baos)))

(defn- create-s3-client ^com.amazonaws.services.s3.AmazonS3 []
  (let [builder (AmazonS3ClientBuilder/standard)]
    (doto ^com.amazonaws.services.s3.AmazonS3ClientBuilder builder
      (.withEndpointConfiguration
       (AwsClientBuilder$EndpointConfiguration. "http://localhost:4566" "us-east-1"))
      (.withCredentials
       (reify com.amazonaws.auth.AWSCredentialsProvider
         (getCredentials [_]
           (BasicAWSCredentials. "test" "test"))
         (refresh [_])))
      (.withPathStyleAccessEnabled true))
    (.build ^com.amazonaws.services.s3.AmazonS3ClientBuilder builder)))

(defn- upload-to-s3-and-get-url [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key ^bytes data]
  (let [metadata     (ObjectMetadata.)
        _            (.setContentLength metadata (alength data))
        input-stream (ByteArrayInputStream. data)
        put-request  (PutObjectRequest. bucket-name key input-stream metadata)]
    (.putObject s3-client put-request)

    (let [one-hour    (* 60 60 1000)
          expiration  (Date. ^Long (+ (System/currentTimeMillis) one-hour))
          url-request (-> (GeneratePresignedUrlRequest. bucket-name key)
                          (.withExpiration expiration)
                          (.withMethod com.amazonaws.HttpMethod/GET))]
      ;; Replace localhost with localstack so the URL works from within Docker containers
      (-> (.generatePresignedUrl s3-client url-request)
          (.toString)
          (clojure.string/replace "http://localhost:4566" "http://localstack:4566")))))

(defn- generate-presigned-put-url [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key]
  (let [one-hour    (* 60 60 1000)
        expiration  (Date. ^Long (+ (System/currentTimeMillis) one-hour))
        url-request (-> (GeneratePresignedUrlRequest. bucket-name key)
                        (.withExpiration expiration)
                        (.withMethod com.amazonaws.HttpMethod/PUT))]
    ;; Replace localhost with localstack so the URL works from within Docker containers
    (-> (.generatePresignedUrl s3-client url-request)
        (.toString)
        (clojure.string/replace "http://localhost:4566" "http://localstack:4566"))))

(defn- read-from-s3 [^com.amazonaws.services.s3.AmazonS3 s3-client bucket-name key]
  (try
    (let [object (.getObject s3-client bucket-name key)]
      (slurp (.getObjectContent object)))
    (catch com.amazonaws.services.s3.model.AmazonS3Exception e
      (if (= 404 (.getStatusCode e))
        ""
        (throw e)))))

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [run-id code table-name->id cancel-chan]
  (let [mount-path    (transforms.settings/python-execution-mount-path)
        work-dir-name (str "run-" (System/currentTimeMillis) "-" (rand-int 10000))
        work-dir      (str mount-path "/" work-dir-name)
        work-dir-file (io/file work-dir)]

    ;; Ensure mount base path exists
    (.mkdirs (io/file mount-path))
    ;; Create working directory
    (.mkdirs work-dir-file)

    (try
      (let [server-url (transforms.settings/python-execution-server-url)
            s3-client (create-s3-client)
            bucket-name "metabase-python-runner"
            ;; Generate S3 keys for output files
            output-key (str work-dir-name "/output.csv")
            stdout-key (str work-dir-name "/stdout.txt")
            stderr-key (str work-dir-name "/stderr.txt")
            ;; Generate presigned URLs for writing
            output-url (generate-presigned-put-url s3-client bucket-name output-key)
            stdout-url (generate-presigned-put-url s3-client bucket-name stdout-key)
            stderr-url (generate-presigned-put-url s3-client bucket-name stderr-key)
            ;; Upload input table data
            table-name->url (into {} (map (fn [[table-name id]]
                                            (let [s3-key (str work-dir-name "/" (gensym) ".jsonl")
                                                  data (write-table-data-to-stream! id cancel-chan)
                                                  url (upload-to-s3-and-get-url s3-client bucket-name s3-key data)]
                                              [table-name url])))
                                  table-name->id)
            canc (a/go (when (a/<! cancel-chan)
                         (http/post (str server-url "/cancel")
                                    {:content-type :json
                                     :body         (json/encode {:request_id run-id})
                                     :async?       true}
                                    identity identity)))
            response (http/post (str server-url "/execute")
                                {:content-type     :json
                                 :accept           :json
                                 :body             (json/encode {:code          code
                                                                 :working_dir   work-dir
                                                                 :timeout       30
                                                                 :request_id    run-id
                                                                 :output_url    output-url
                                                                 :stdout_url    stdout-url
                                                                 :stderr_url    stderr-url
                                                                 :table_mapping table-name->url})
                                 :throw-exceptions false
                                 :as               :json})
            _        (a/close! canc)

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
              (if (not (clojure.string/blank? output-content))
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
            ;; Clean up working directory after use
            (try
              (when (.exists work-dir-file)
                ;; Delete directory and all contents
                (run! safe-delete (reverse (file-seq work-dir-file))))
              (catch Exception _)))))

      (catch CancellationException _
        {:status 408
         :body   {:error "Interrupted"}})

      (catch Exception e
        {:status 500
         :body   {:error (str "Failed to connect to Python execution server: " (.getMessage e))}}))))
