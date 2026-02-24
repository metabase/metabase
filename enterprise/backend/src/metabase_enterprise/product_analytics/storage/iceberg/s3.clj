(ns metabase-enterprise.product-analytics.storage.iceberg.s3
  "S3 client and FileIO configuration for the Iceberg storage backend."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.util.log :as log])
  (:import
   (java.net URI)
   (java.util HashMap)
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials DefaultCredentialsProvider
                                            StaticCredentialsProvider)
   (software.amazon.awssdk.regions Region)
   (software.amazon.awssdk.services.s3 S3Client S3ClientBuilder S3Configuration)))

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

(defn s3-file-io-properties
  "Return a java.util.Map of S3 FileIO properties for Iceberg catalog configuration.
   These properties configure the `S3FileIO` used by Iceberg for data file I/O."
  ^java.util.Map []
  (let [props (HashMap.)]
    ;; S3FileIO properties — Iceberg uses these when creating its own S3FileIO
    (when-let [endpoint (iceberg.settings/product-analytics-iceberg-s3-endpoint)]
      (.put props "s3.endpoint" endpoint))
    (when-let [region (iceberg.settings/product-analytics-iceberg-s3-region)]
      (.put props "s3.region" region))
    (when-let [access-key (iceberg.settings/product-analytics-iceberg-s3-access-key)]
      (.put props "s3.access-key-id" access-key))
    (when-let [secret-key (iceberg.settings/product-analytics-iceberg-s3-secret-key)]
      (.put props "s3.secret-access-key" secret-key))
    (when (iceberg.settings/product-analytics-iceberg-s3-path-style-access)
      (.put props "s3.path-style-access" "true"))
    (.put props "io-impl" "org.apache.iceberg.aws.s3.S3FileIO")
    props))
