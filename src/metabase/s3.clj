(ns metabase.s3
  (:require [clojure.java.io :as io])
  (:import (java.net URL HttpURLConnection)
           (java.io ByteArrayOutputStream)))


;; TODO Needs AWS_... env vars for auth in order for these to work

(defn- file->bytes ^bytes [file]
  (with-open [xin (io/input-stream file)
              xout (ByteArrayOutputStream.)]
    (io/copy xin xout)
    (.toByteArray xout)))

(defn upload-to-url
  "Given an S3 upload URL, upload a file path to it."
  [^URL url obj-path]
  (let [conn (doto ^HttpURLConnection (.openConnection url)
               (.setDoOutput true)
               (.setRequestMethod "PUT"))
        the-data (file->bytes obj-path)]
    (.write (.getOutputStream conn) the-data)
    (println "S3 upload: " (.getResponseCode conn))
    (when-not (= 200 (.getResponseCode conn))
      (throw (ex-info "Could not upload to S3" {:status (.getResponseCode conn)})))
    (.getResponseCode conn)))
