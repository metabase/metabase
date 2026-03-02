(ns metabase-enterprise.product-analytics.storage.iceberg.s3
  "S3 client and FileIO configuration for the Iceberg storage backend."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.net URI)
   (java.util HashMap)
   (org.apache.iceberg.aws.s3 S3FileIO)
   (org.apache.iceberg.util SerializableSupplier)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials DefaultCredentialsProvider
                                            StaticCredentialsProvider)
   (software.amazon.awssdk.core.sync RequestBody)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.s3 S3Client S3ClientBuilder S3Configuration)
   (software.amazon.awssdk.services.s3.model PutObjectRequest)))

(set! *warn-on-reflection* true)

(defn- maybe-with-endpoint
  ^S3ClientBuilder [^S3ClientBuilder builder]
  (when-let [region (iceberg.settings/product-analytics-iceberg-s3-region)]
    (.region builder (Region/of region)))
  (when-let [endpoint (iceberg.settings/product-analytics-iceberg-s3-endpoint)]
    (.endpointOverride builder (URI/create endpoint)))
  builder)

(defn- maybe-with-credentials
  ^S3ClientBuilder [^S3ClientBuilder builder]
  (let [access-key (iceberg.settings/product-analytics-iceberg-s3-access-key)
        secret-key (iceberg.settings/product-analytics-iceberg-s3-secret-key)]
    (if (and access-key secret-key)
      (.credentialsProvider builder
                            (StaticCredentialsProvider/create
                             (AwsBasicCredentials/create access-key secret-key)))
      (do
        (when (or access-key secret-key)
          (log/warnf "Ignoring %s because %s is not defined"
                     (if access-key "access-key" "secret-key")
                     (if (not access-key) "access-key" "secret-key")))
        (.credentialsProvider builder (DefaultCredentialsProvider/create))))))

(defn- s3-configuration
  ^S3Configuration []
  (let [path-style (iceberg.settings/product-analytics-iceberg-s3-path-style-access)]
    (-> (S3Configuration/builder)
        (.pathStyleAccessEnabled (boolean path-style))
        (.chunkedEncodingEnabled (not (boolean path-style)))
        (.build))))

(defn create-s3-client
  "Create an S3 client configured from Product Analytics Iceberg settings."
  ^S3Client []
  (.build
   (doto (S3Client/builder)
     maybe-with-endpoint
     maybe-with-credentials
     (.serviceConfiguration (s3-configuration)))))

(def ^:private s3-client-atom (atom nil))

(defn s3-client
  "Return a cached S3 client, creating it if necessary."
  ^S3Client []
  (or @s3-client-atom
      (let [client (create-s3-client)]
        (reset! s3-client-atom client)
        client)))

(defn reset-s3-client!
  "Reset the cached S3 client (e.g. when settings change)."
  []
  (reset! s3-client-atom nil))

(defn upload-file!
  "Upload a local file to S3 at the given S3 URI (s3://bucket/key).
   Uses our own S3 client which has chunked encoding disabled, avoiding
   'Invalid payload signature' errors with S3-compatible services like Garage."
  [^String s3-uri ^File local-file]
  (let [uri    (URI/create s3-uri)
        bucket (.getHost uri)
        key    (subs (.getPath uri) 1)]
    (.putObject (s3-client)
                (-> (PutObjectRequest/builder)
                    (.bucket bucket)
                    (.key key)
                    (.contentLength (.length local-file))
                    ^PutObjectRequest (.build))
                (RequestBody/fromFile local-file))))

(defn patch-file-io-s3-client!
  "Replace the S3FileIO's internal S3 client with our own that has chunked encoding disabled.
   Iceberg's S3FileIO creates its own S3 client internally (via DefaultAwsClientFactory) which
   uses chunked payload signing by default. S3-compatible services (Garage, MinIO, Ceph) reject
   these requests with 'Invalid payload signature'. This patches the lazily-initialized `s3` field
   before any I/O occurs so all writes (data files AND metadata/manifests) use our client."
  [file-io]
  (when (instance? S3FileIO file-io)
    (let [client   (create-s3-client)
          supplier (reify SerializableSupplier
                     (get [_] client))
          s3-field (doto (.getDeclaredField S3FileIO "s3")
                     (.setAccessible true))]
      (.set s3-field ^S3FileIO file-io supplier)
      (log/info "Patched S3FileIO client with chunked-encoding-disabled S3 client"))))

(defn s3-file-io-properties
  "Return a java.util.Map of S3 FileIO properties for Iceberg catalog configuration.
   These properties configure the `S3FileIO` used by Iceberg for data file I/O."
  ^java.util.Map []
  (let [props (HashMap.)]
    ;; S3FileIO properties — Iceberg uses these when creating its own S3FileIO
    (when-let [endpoint (iceberg.settings/product-analytics-iceberg-s3-endpoint)]
      (.put props "s3.endpoint" endpoint))
    (when-let [region (iceberg.settings/product-analytics-iceberg-s3-region)]
      (.put props "s3.region" region)
      ;; client.region is needed by the underlying AWS SDK client builder;
      ;; without it, the SDK falls back to DefaultAwsRegionProviderChain
      (.put props "client.region" region))
    (when-let [access-key (iceberg.settings/product-analytics-iceberg-s3-access-key)]
      (.put props "s3.access-key-id" access-key))
    (when-let [secret-key (iceberg.settings/product-analytics-iceberg-s3-secret-key)]
      (.put props "s3.secret-access-key" secret-key))
    (when (iceberg.settings/product-analytics-iceberg-s3-path-style-access)
      (.put props "s3.path-style-access" "true"))
    (.put props "io-impl" "org.apache.iceberg.aws.s3.S3FileIO")
    props))
