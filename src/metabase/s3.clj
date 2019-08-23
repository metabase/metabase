(ns metabase.s3
  (:require [amazonica.aws.s3 :as aws-s3]
            [amazonica.aws.s3transfer :as aws-s3-transfer]
            [clojure.java.io :as io]))

;;TODO credentials

(defn upload [path s3-bucket s3-key]
  (let [upload-file (io/file path)]
    (aws-s3/put-object :bucket-name s3-bucket
                       :key s3-key
                       :metadata {:server-side-encryption "AES256"}
                       :file upload-file)))

(defn download [path s3-bucket s3-key]
  (let [download-file (io/file path)
        dl-contents (-> (aws-s3/get-object s3-bucket s3-key)
                        :input-stream
                        slurp)]
    (spit download-file dl-contents)))
