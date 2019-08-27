(ns metabase.s3
  (:require [amazonica.aws.s3 :as aws-s3]
            [clojure.java.io :as io])
  (:import (java.net URL HttpURLConnection)
           (java.io ByteArrayOutputStream)))

;;TODO credentials

;; Needs AWS_... env vars for auth in order for these to work

(defn upload
  "Upload a path to an S3 bucket/key"
  [obj-path s3-bucket s3-key]
  (let [upload-file (io/file obj-path)]
    (aws-s3/put-object :bucket-name s3-bucket
                       :key s3-key
                       :metadata {:server-side-encryption "AES256"}
                       :file upload-file)))

(defn download
  "Download to a path to an S3 bucket/key"
  [obj-path s3-bucket s3-key]
  (let [dl-contents (-> (aws-s3/get-object s3-bucket s3-key)
                        :input-stream)]
    (io/copy dl-contents (io/file obj-path))))

(defn- file->bytes ^bytes [file]
  (with-open [xin  (io/input-stream file)
              xout (ByteArrayOutputStream.)]
    (io/copy xin xout)
    (.toByteArray xout)))

(defn upload-to-url
  "Given an S3 upload URL, upload a file path to it."
  [^URL url obj-path]
  (let [conn     (doto ^HttpURLConnection (.openConnection url)
                   (.setDoOutput true)
                   (.setRequestMethod "PUT"))
        the-data (file->bytes obj-path)]
    (.write (.getOutputStream conn) the-data)
    (println "S3 upload: " (.getResponseCode conn))
    (when-not (= 200 (.getResponseCode conn))
      (throw (ex-info "Could not upload to S3" {:status (.getResponseCode conn)})))
    (.getResponseCode conn)))

