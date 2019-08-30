(ns metabase.cmd.dump-download
  (:require [metabase.crypto.symmetric :as symm]
            [clojure.java.io :as io]
            [metabase.zip :as zip])
  (:import (java.io ByteArrayOutputStream)))

(defn- file->bytes ^bytes [file]
  (with-open [xin (io/input-stream file)
              xout (ByteArrayOutputStream.)]
    (io/copy xin xout)
    (.toByteArray xout)))



(defn- uri->file [uri file]
  (io/make-parents file)
  (with-open [in (io/input-stream uri)
              out (io/output-stream file)]
    (io/copy in out)))


(defn- decrypt-payload-bytes ^bytes [^bytes enc-payload secret-key]
  (symm/decrypt-b64-bytes enc-payload secret-key))


(defn down! [h2-dump-path s3-bucket s3-key secret-key]
  (println "Loading from H2 dump:" s3-bucket s3-key h2-dump-path (count secret-key))
  (let [enc-dump-path "./dumps_in/dumped.enc"
        enc-secret-path "./dumps_in/dumped_secret.enc"
        zip-path "./dumps_in/dumped.zip"

        ;;Item will have been made public so we can download this
        _ (uri->file (format "https://%s.s3.amazonaws.com/%s" s3-bucket s3-key) zip-path)

        _ (zip/unzip-secure-dump {:zip-path zip-path
                              :dump-path    enc-dump-path
                              :secret-path  enc-secret-path})
        enc-payload (file->bytes enc-dump-path)
        enc-payload-decrypted (decrypt-payload-bytes enc-payload secret-key)]
    (with-open [w (io/output-stream h2-dump-path)]
      (.write w enc-payload-decrypted))


    ;(metabase.cmd.load-from-h2/load-from-h2! h2-dump-path)


    (println "Done " h2-dump-path s3-bucket s3-key secret-key)))
