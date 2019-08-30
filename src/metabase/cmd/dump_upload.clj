(ns metabase.cmd.dump-upload
  (:require [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [clojure.java.io :as io]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]
            [metabase.crypto.random :as crand]
            [metabase.s3 :as s3]
            [metabase.zip :as zip])
  (:import (java.net URL)
           (java.io ByteArrayOutputStream)))

(defn- file->bytes ^bytes [file]
  (with-open [xin (io/input-stream file)
              xout (ByteArrayOutputStream.)]
    (io/copy xin xout)
    (.toByteArray xout)))

(defn- same-contents? [file1 file2]
  (= (seq (file->bytes file1))
     (seq (file->bytes file2))))

(defn- decrypt-payload-bytes ^bytes [^bytes enc-payload secret-key]
  (symm/decrypt-b64-bytes enc-payload secret-key))

(defn- encrypt-file
  [{:keys [inpath enc-dump-path enc-secret-path key-spec]}]
  (assert (and inpath enc-dump-path) "Needs both source and target file to encrypt.")
  (try
    (let [secret-key (or (:secret-key key-spec))
          pub-key (or (:pub-key-path key-spec))
          payload-bytes (file->bytes inpath)
          enc-payload (symm/encrypt-bytes-to-b64 payload-bytes secret-key)
          enc-secret (asymm/encrypt secret-key (asymm/pub-key pub-key))
          enc-out-path enc-dump-path
          enc-out-dec-path (str enc-dump-path ".dec.debug")]
      (println "Writing encrypted content" enc-out-path)
      (spit (io/file enc-out-path) enc-payload)
      (io/copy (io/file inpath) (io/file (str inpath ".backup")))

      (println "Writing encrypted secret" enc-secret-path)
      (spit (io/file enc-secret-path) enc-secret)
      (println "Writing decrypted content" enc-out-dec-path)

      (let [enc-payload-decrypted (decrypt-payload-bytes (file->bytes enc-out-path) secret-key)]
        (with-open [w (io/output-stream enc-out-dec-path)]
          (.write w enc-payload-decrypted))
        (assert (same-contents? inpath enc-out-dec-path))
        (assert (= (seq payload-bytes)
                   (seq enc-payload-decrypted)))))
    (catch Exception e
      (println "Error: " e))))


(defn up! [s3-upload-url-str h2-dump-path]
  (let [
        zip-path "./dumps_out/dump.zip"
        ;;TODO call with ../..h2.db, end up with ..h2.db.mv.db, load-from-h2 without .mv.db
        ;h2-dump-path "./dumps_out/dump.h2.db.mv.db"
        enc-dump-path "./dumps_out/dump.aes.enc"
        enc-secret-path "./dumps_out/dump.secret.aes.enc"
        aes-secret (crand/fixed-length-string)
        s3-upload-url (URL. s3-upload-url-str)]

    ;(dump-to-h2/dump-to-h2! curr-db-conn-str nil)

    (encrypt-file {:inpath          h2-dump-path
                   :enc-dump-path   enc-dump-path
                   :enc-secret-path enc-secret-path
                   :key-spec        {:secret-key   aes-secret
                                     ;;TODO get pub key from path
                                     :pub-key-path "./keys/pub_key"}})

    (zip/zip-secure-dump {:enc-dump-path   enc-dump-path
                      :enc-secret-path enc-secret-path
                      :zip-path        zip-path})

    (s3/upload-to-url s3-upload-url zip-path)

    (println "Done " s3-upload-url-str)))
