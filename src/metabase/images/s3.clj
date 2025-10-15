(ns metabase.images.s3
  (:require
   [metabase.images.settings :as images.settings])
  (:import
   (software.amazon.awssdk.auth.credentials AwsBasicCredentials StaticCredentialsProvider)
   (software.amazon.awssdk.core ResponseBytes)
   (software.amazon.awssdk.services.s3 S3Client)
   (software.amazon.awssdk.services.s3.model GetObjectRequest PutObjectRequest)))

(set! *warn-on-reflection* true)

(defn- client ^S3Client []
  (.build (doto (S3Client/builder)
            (.region software.amazon.awssdk.regions.Region/US_EAST_1)
            (.credentialsProvider (StaticCredentialsProvider/create
                                   (AwsBasicCredentials/create
                                    (images.settings/image-upload-aws-access-key-id)
                                    (images.settings/image-upload-aws-secret-access-key)))))))

(defn fetch-image ^bytes [s3-url]
  (let [[_ ^String bucket ^String object-key] (re-find #"^s3://([^/]+)/(.+)$" s3-url)
        ^GetObjectRequest request             (.build (doto (GetObjectRequest/builder)
                                                        (.key object-key)
                                                        (.bucket bucket)))
        ^ResponseBytes response               (.getObjectAsBytes (client) request)]
    (.asByteArray response)))

(defn upload-image!
  "Returns the AWS S3 URL."
  ^String [^java.io.File file]
  (let [^java.nio.file.Path path  (.toPath file)
        object-key                (str (.getFileName path))
        ^PutObjectRequest request (.build (doto (PutObjectRequest/builder)
                                            (.bucket (images.settings/image-upload-bucket))
                                            (.key object-key)))]
    (.putObject (client) request path)
    (format "s3://%s/%s" (images.settings/image-upload-bucket) object-key)))
