(ns metabase-enterprise.transforms-python.s3
  (:require
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.util.log :as log])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable File InputStream)
   (java.net URI)
   (java.time Duration)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.auth.credentials AwsCredentialsProvider DefaultCredentialsProvider)
   (software.amazon.awssdk.core.sync RequestBody)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.s3 S3Client S3ClientBuilder S3Configuration)
   (software.amazon.awssdk.services.s3.model DeleteObjectRequest GetObjectRequest NoSuchKeyException PutObjectRequest)
   (software.amazon.awssdk.services.s3.presigner S3Presigner S3Presigner$Builder)
   (software.amazon.awssdk.services.s3.presigner.model GetObjectPresignRequest PutObjectPresignRequest)))

(set! *warn-on-reflection* true)

;; TODO We should make these durations configurable in future.

;; Longer duration for inputs than for outputs, to compensate for the duration of the code execution itself.
(def ^:private ^Duration presigned-get-duration (Duration/ofMinutes 30))
(def ^:private ^Duration presigned-put-duration (Duration/ofHours 5))

;; We should consider namespacing these paths, for example, using the run id to simplify cleanup.
;; Another idea is to have deterministic paths, so that it's easier to resume incomplete runs.
(defn- working-dir-for-run
  "The path within the target bucket within which to store all the files for this run."
  []
  (let [shared-prefix (some-> (transforms-python.settings/python-storage-s-3-prefix) (str "/"))]
    (str shared-prefix "run-" (System/nanoTime) "-" (rand-int 10000))))

(defmacro ^:private maybe-with-endpoint* [builder endpoint]
  `(let [builder# ~builder]
     (when-let [region# (transforms-python.settings/python-storage-s-3-region)]
       (.region builder# (Region/of region#)))
     (when ~endpoint (.endpointOverride builder# (URI/create ~endpoint)))
     builder#))

(defn- maybe-with-endpoint-s3-client [^S3ClientBuilder builder endpoint]
  (maybe-with-endpoint* builder endpoint))

(defn- maybe-with-endpoint-s3-presigner [^S3Presigner$Builder builder endpoint]
  (maybe-with-endpoint* builder endpoint))

(defn- s3-configuration ^S3Configuration []
  (let [path-style-access (transforms-python.settings/python-storage-s-3-path-style-access)]
    (-> (S3Configuration/builder)
        (.pathStyleAccessEnabled path-style-access)
        ;; Disable chunked encoding when using path-style access, as most S3-compatible
        ;; services don't handle it properly
        (.chunkedEncodingEnabled (not path-style-access))
        (.build))))

(defn- put-object-request ^PutObjectRequest [^String bucket-name ^String key]
  (-> (PutObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defn- get-object-request ^GetObjectRequest [^String bucket-name ^String key]
  (-> (GetObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defn- delete-object-request ^DeleteObjectRequest [^String bucket-name ^String key]
  (-> (DeleteObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defn- maybe-with-credentials*
  [credentials-provider]
  (let [access-key (transforms-python.settings/python-storage-s-3-access-key)
        secret-key (transforms-python.settings/python-storage-s-3-secret-key)]
    (if (or access-key secret-key)
      (if-not (and access-key secret-key)
        (do (log/warnf "Ignoring %s because %s is not defined"
                       (if access-key "access-key" "secret-key")
                       (if (not access-key) "access-key" "secret-key"))
            (credentials-provider (DefaultCredentialsProvider/create)))
        (credentials-provider
         (StaticCredentialsProvider/create
          (AwsBasicCredentials/create access-key secret-key))))
      (credentials-provider (DefaultCredentialsProvider/create)))))

(defn- maybe-with-credentials-s3-client [^S3ClientBuilder builder]
  (maybe-with-credentials* #(.credentialsProvider builder ^AwsCredentialsProvider %)))

(defn- maybe-with-credentials-s3-presigner [^S3Presigner$Builder builder]
  (maybe-with-credentials* #(.credentialsProvider builder ^AwsCredentialsProvider %)))

;; We just recreate the client every time, to keep things simple if config is changed.
(defn create-s3-client
  "Create S3 client for transferring table data and manifests."
  ^S3Client []
  (.build
   (doto (S3Client/builder)
     (maybe-with-endpoint-s3-client (transforms-python.settings/python-storage-s-3-endpoint))
     maybe-with-credentials-s3-client
     (.serviceConfiguration (s3-configuration)))))

(defn- create-s3-presigner-for-container
  "Create S3 presigner for container operations (presigned URLs). Uses distinct container-endpoint if relevant."
  ^S3Presigner []
  (let [container-endpoint (transforms-python.settings/python-storage-s-3-container-endpoint)
        endpoint           (or container-endpoint (transforms-python.settings/python-storage-s-3-endpoint))]
    (.build
     (doto (S3Presigner/builder)
       (maybe-with-endpoint-s3-presigner endpoint)
       maybe-with-credentials-s3-presigner
       (.serviceConfiguration (s3-configuration))))))

(defn- generate-presigned-get-url
  "Generate GET URL using container presigner"
  [^S3Presigner presigner ^String bucket-name ^String key]
  (let [request (-> (GetObjectPresignRequest/builder)
                    (.signatureDuration presigned-get-duration)
                    (.getObjectRequest (get-object-request bucket-name key))
                    (.build))]
    (.toString (.url (.presignGetObject presigner request)))))

(defn- generate-presigned-put-url
  "Generate PUT URL using container presigner"
  [^S3Presigner presigner ^String bucket-name ^String key]
  (let [request (-> (PutObjectPresignRequest/builder)
                    (.signatureDuration presigned-put-duration)
                    (.putObjectRequest (put-object-request bucket-name key))
                    (.build))]
    (.toString (.url (.presignPutObject presigner request)))))

(defn- s3-shared-storage [table-name->id]
  (let [work-dir-name       (working-dir-for-run)
        container-presigner (create-s3-presigner-for-container)
        bucket-name         (transforms-python.settings/python-storage-s-3-bucket)
        ref                 (fn [method relative-path]
                              (let [path (str work-dir-name "/" relative-path)]
                                {:path   path
                                 :method method
                                 :url    (case method
                                           :put (generate-presigned-put-url container-presigner bucket-name path)
                                           :get (generate-presigned-get-url container-presigner bucket-name path))}))]
    ;; It feels dirty mixing the S3 client object with the other pure values, but it is convenient for the caller
    {:s3-client   (create-s3-client)
     :bucket-name bucket-name
     :objects
     (into
      {:output          (ref :put "output.csv")
       :output-manifest (ref :put "output-manifest.json")
       :events          (ref :put "events.jsonl")}
      (for [[table-name id] table-name->id]
        {[:table id :manifest] (ref :get (str "table-" (name table-name) "-" id ".manifest.json"))
         [:table id :data]     (ref :get (str "table-" (name table-name) "-" id ".jsonl"))}))}))

(declare delete-many)

;; TODO this feels like it's a hair's width from abstracting away s3 versus other transfer mechanisms - go all the way
(defn open-shared-storage!
  "Returns a map wrapped in a deref-able auto-closable, to be used in a with-open.

  The map contains:
  - :s3-client   - an S3Client that can be used to upload/download files
  - :bucket-name - the S3 bucket name
  - :objects     - a map of keys to {:path :method :url} maps, where:
    - :path   is the S3 key
    - :method is either :get or :put, indicating whether the python-runner should fetch or upload the file.
    - :url    is the presigned URL to be used by the python-runner to fetch or upload the file.

  The objects are broken into the following transform inputs:

  - [:table id :manifest] - for each input table, the manifest JSON file
  - [:table id :data]     - for each input table, the data file, in format specified by the manifest.

  And the following transform outputs:
  - :output-manifest - the output manifest JSON file
  - :output          - the output data file, in format specified by the output manifest.
  - :events          - a JSONL file containing the events logged during python execution.

  When the value is closed, all the relevant keys will be deleted, but this is best-effort only.
  We rely on the bucket retention policy to ensure any stragglers are eventually deleted."
  ^Closeable [table-name->id]
  (let [shared-storage (s3-shared-storage table-name->id)]
    (reify IDeref
      (deref [_] shared-storage)
      Closeable
      (close [_] (delete-many (:s3-client shared-storage)
                              (:bucket-name shared-storage)
                              (map :path (vals (:objects shared-storage))))))))

(defn upload-file
  "Upload the given file to s3"
  [^S3Client s3 ^String bucket ^String key ^File file]
  (let [^PutObjectRequest req (put-object-request bucket key)
        body (if (zero? (.length file))
               (RequestBody/empty)
               (RequestBody/fromFile file))]
    (.putObject  s3 req body)))

(defn open-object
  "Get back the contents of the given key as a InputStream."
  ^InputStream [^S3Client s3-client ^String bucket-name ^String key]
  (try
    (let [^GetObjectRequest request (get-object-request bucket-name key)]
      (.getObject s3-client request))
    (catch NoSuchKeyException _ nil)))

(defn read-to-string
  "Get back the contents of the given key as a string."
  ([s3-client bucket-name key] (read-to-string s3-client bucket-name key nil))
  ([^S3Client s3-client ^String bucket-name ^String key not-found]
   (if-some [in (open-object s3-client bucket-name key)]
     (with-open [ret in]
       (slurp ret))
     not-found)))

(defn delete
  ;; TODO better error handling
  "Delete the given key from s3, ignoring any errors for now"
  [^S3Client s3-client ^String bucket-name ^String key]
  (try
    (.deleteObject s3-client (delete-object-request bucket-name key))
    (catch Exception e
      (log/debugf e "Error deleting s3 object %s" key)
      ;; Ignore deletion errors - object might not exist, or we might not have permissions
      ;; NOTE: we plan to put general retention on the bucket so that objects will eventually be deleted
      nil)))

(defn delete-many
  "Best effort delete the given s3 keys"
  [^S3Client s3-client bucket-name s3-keys]
  (run! (partial delete s3-client bucket-name) s3-keys))
