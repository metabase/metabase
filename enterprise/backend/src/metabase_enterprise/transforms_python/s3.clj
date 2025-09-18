(ns metabase-enterprise.transforms-python.s3
  (:require
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   ;; TODO check that querying team are ok with us accessing this directly, otherwise make another plan
   [metabase.util.log :as log])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable File)
   (java.net URI)
   (java.time Duration)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.auth.credentials DefaultCredentialsProvider)
   (software.amazon.awssdk.core.sync RequestBody)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.s3 S3Client S3ClientBuilder S3Configuration)
   (software.amazon.awssdk.services.s3.model DeleteObjectRequest GetObjectRequest NoSuchKeyException PutObjectRequest)
   (software.amazon.awssdk.services.s3.presigner S3Presigner S3Presigner$Builder)
   (software.amazon.awssdk.services.s3.presigner.model GetObjectPresignRequest PutObjectPresignRequest)))

(set! *warn-on-reflection* true)

;; Longer duration for inputs than for outputs, to compensate for the duration of the code execution itself.
(def ^:private ^Duration presigned-get-duration (Duration/ofMinutes 30))
(def ^:private ^Duration presigned-put-duration (Duration/ofHours 5))

(defmacro ^:private maybe-with-endpoint* [builder endpoint]
  `(do (when-let [region# (transforms-python.settings/python-storage-s-3-region)]
         (.region ~builder (Region/of region#)))
       (when ~endpoint (.endpointOverride ~builder (URI/create ~endpoint)))
       ~builder))

(defn- maybe-with-endpoint-s3-client [^S3ClientBuilder builder endpoint]
  (maybe-with-endpoint* builder endpoint))

(defn- maybe-with-endpoint-s3-presigner [^S3Presigner$Builder builder endpoint]
  (maybe-with-endpoint* builder endpoint))

(defn- s3-configuration
  "Create S3Configuration with path-style access setting"
  ^S3Configuration []
  (-> (S3Configuration/builder)
      (.pathStyleAccessEnabled (transforms-python.settings/python-storage-s-3-path-style-access))
      (.build)))

(defn- put-object-request ^PutObjectRequest [^String bucket-name ^String key]
  (-> (PutObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defn- get-object-request ^GetObjectRequest [^String bucket-name ^String key]
  (-> (GetObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defn- delete-object-request ^DeleteObjectRequest [^String bucket-name ^String key]
  (-> (DeleteObjectRequest/builder) (.bucket bucket-name) (.key key) .build))

(defmacro ^:private maybe-with-credentials*
  "Use macro to avoid reflection, as their is no shared interface between S3ClientBuilder and S3Presigner$Builder"
  [builder]
  `(let [access-key# (transforms-python.settings/python-storage-s-3-access-key)
         secret-key# (transforms-python.settings/python-storage-s-3-secret-key)]
     (if (or access-key# secret-key#)
       (if-not (and access-key# secret-key#)
         (do (log/warnf "Ignoring %s because %s is not defined"
                        (if access-key# "access-key" "secret-key")
                        (if (not access-key#) "access-key" "secret-key"))
             (.credentialsProvider ~builder (DefaultCredentialsProvider/create)))
         (.credentialsProvider ~builder
                               (StaticCredentialsProvider/create
                                (AwsBasicCredentials/create access-key# secret-key#))))
       (.credentialsProvider ~builder (DefaultCredentialsProvider/create)))))

(defn- maybe-with-credentials-s3-client [^S3ClientBuilder builder]
  (maybe-with-credentials* builder))

(defn- maybe-with-credentials-s3-presigner [^S3Presigner$Builder builder]
  (maybe-with-credentials* builder))

;; We just recreate the client every time, to keep things simple if config is changed.
(defn- create-s3-client
  "Create S3 client for host operations (uploads, reads)"
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

(defn upload-file-to-s3
  "Upload the given file to s3"
  [^S3Client s3-client ^String bucket-name ^String key ^File file]
  (let [^PutObjectRequest request (put-object-request bucket-name key)]
    (.putObject s3-client request (RequestBody/fromFile file))))

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

(defn- delete-s3-object [^S3Client s3-client ^String bucket-name ^String key]
  (try
    (.deleteObject s3-client (delete-object-request bucket-name key))
    (catch Exception e
      (log/debugf e "Error deleting s3 object %s" key)
      ;; Ignore deletion errors - object might not exist, or we might not have permissions
      ;; NOTE: we plan to put general retention on the bucket so that objects will eventually be deleted
      nil)))

(defn- cleanup-s3-objects [^S3Client s3-client bucket-name s3-keys]
  (run! (partial delete-s3-object s3-client bucket-name) s3-keys))

(defn read-from-s3
  "Get back the contents of the given key as a string."
  ([s3-client bucket-name key] (read-from-s3 s3-client bucket-name key ::throw))
  ([^S3Client s3-client ^String bucket-name ^String key not-found]
   (try
     (let [^GetObjectRequest request (get-object-request bucket-name key)
           response                  (.getObject s3-client request)]
       (slurp response))
     (catch NoSuchKeyException e
       (if (identical? ::throw not-found)
         (throw e)
         not-found)))))

(defn- s3-shared-storage [table-name->id]
  (let [prefix              (some-> (transforms-python.settings/python-storage-s-3-prefix) (str "/"))
        work-dir-name       (str prefix "run-" (System/nanoTime) "-" (rand-int 10000))
        container-presigner (create-s3-presigner-for-container)
        bucket-name         (transforms-python.settings/python-storage-s-3-bucket)
        ref                 (fn [method relative-path]
                              (let [path (str work-dir-name "/" relative-path)]
                                {:path   path
                                 :method method
                                 :url    (case method
                                           :put (generate-presigned-put-url container-presigner bucket-name path)
                                           :get (generate-presigned-get-url container-presigner bucket-name path))}))]
    ;; a smell to be mixing interactive things with descriptions, but its damn convenient to have it here for now
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

(defn open-s3-shared-storage!
  "Returns a deref'able shared storage value, (.close) will optimistically delete any s3 objects named in storage (data files for tables, metadata files etc).
  The intention is the bucket specifies a generic object retention policy to ensure objects are eventually deleted (e.g. because the process dies during writing and .close never gets called)"
  ^Closeable [table-name->id]
  (let [shared-storage (s3-shared-storage table-name->id)]
    (reify IDeref
      (deref [_] shared-storage)
      Closeable
      (close [_] (cleanup-s3-objects (:s3-client shared-storage)
                                     (:bucket-name shared-storage)
                                     (map :path (vals (:objects shared-storage))))))))
