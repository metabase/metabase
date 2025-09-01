(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
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
   (java.util Date)))

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
  [driver db-id query respond]
  (driver/with-driver driver
    (let [native (qp.compile/compile {:type :query, :database db-id :query query})

          query {:database db-id
                 :type :native
                 :native native}]
      (qp.store/with-metadata-provider db-id
        (driver/execute-reducible-query driver query {} respond)))))

(defn- write-table-data! [id file]
  (let [db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query {:source-table id}]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream file)]
                            (write-to-stream! os (mapv :name cols-meta) reducible-rows))))))

(defn- write-table-data-to-stream! [id]
  (let [db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query {:source-table id}
        baos (ByteArrayOutputStream.)]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (write-to-stream! baos (mapv :name cols-meta) reducible-rows)))
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

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [code table-name->id]
  (let [mount-path (transforms.settings/python-execution-mount-path)
        work-dir-name (str "run-" (System/currentTimeMillis) "-" (rand-int 10000))
        work-dir (str mount-path "/" work-dir-name)
        work-dir-file (io/file work-dir)]

    ;; Ensure mount base path exists
    (.mkdirs (io/file mount-path))
    ;; Create working directory
    (.mkdirs work-dir-file)

    (try
      (let [server-url (transforms.settings/python-execution-server-url)
            s3-client (create-s3-client)
            bucket-name "metabase-python-runner"
            table-name->url (into {} (map (fn [[table-name id]]
                                            (let [s3-key (str work-dir-name "/" (gensym) ".jsonl")
                                                  data (write-table-data-to-stream! id)
                                                  url (upload-to-s3-and-get-url s3-client bucket-name s3-key data)]
                                              [table-name url])))
                                  table-name->id)
            response (http/post (str server-url "/execute")
                                {:content-type     :json
                                 :accept           :json
                                 :body             (json/encode {:code          code
                                                                 :working_dir   work-dir
                                                                 :timeout       30
                                                                 :table_mapping table-name->url})
                                 :throw-exceptions false
                                 :as               :json})

            result  (:body response)
            ;; TODO look into why some tests return json and others strings
            result (if (string? result) (json/decode result keyword) result)]

        (try
          (if (and (= 200 (:status response))
                   (zero? (:exit_code result)))
            ;; Success - read the output CSV if it exists
            (let [output-path (:output_file result)]
              (if (and output-path (.exists (io/file output-path)))
                {:status 200
                 :body   {:output (slurp output-path)
                          :stdout (safe-slurp (:stdout_file result))
                          :stderr (safe-slurp (:stderr_file result))}}
                {:status 500
                 :body   {:error  "Transform did not produce output CSV"
                          :stdout (safe-slurp (:stdout_file result))
                          :stderr (safe-slurp (:stderr_file result))}}))
            ;; Error from execution server
            {:status 500
             :body
             {:error     (or (:error result) "Execution failed")
              :exit-code (:exit_code result)
              :timeout   (:timeout result)
              :stdout    (safe-slurp (:stdout_file result))
              :stderr    (safe-slurp (:stderr_file result))}})
          (finally
            ;; Clean up working directory after use
            (try
              (when (.exists work-dir-file)
                ;; Delete directory and all contents
                (run! safe-delete (reverse (file-seq work-dir-file))))
              (catch Exception _)))))

      (catch Exception e
        {:status 500
         :body {:error (str "Failed to connect to Python execution server: " (.getMessage e))}}))))
