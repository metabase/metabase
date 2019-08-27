(ns metabase.cmd.secure-dump
  (:require [clojure.java.io :as io]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.s3 :as s3]
            [metabase.cmd.load-from-h2 :as load-from-h2])
  (:import (java.util.zip ZipEntry ZipOutputStream ZipInputStream)
           (java.net URL)))

(defn- same-contents? [file1 file2]
  (= (slurp (io/file file1))
     (slurp (io/file file2))))

(defn- decrypt-payload [enc-payload secret-key]
  (symm/decrypt enc-payload secret-key))

(defn- decrypt-file
  [{:keys [enc-dump-path outpath enc-secret-path key-spec]}]
  (assert (and enc-dump-path outpath) "Needs both source and target file to decrypt.")
  (try
    (let [enc-secret-key (slurp (io/file enc-secret-path))
          private-key (or (:private-key-path key-spec))
          secret-key (asymm/decrypt enc-secret-key (asymm/private-key private-key))
          enc-payload (slurp (io/file enc-dump-path))
          enc-payload-decrypted (symm/decrypt enc-payload secret-key)]
      (println "Writing decrypted contents to: " outpath)
      (spit (io/file outpath) enc-payload-decrypted))
    (catch Exception e
      (println "Error: " e))))

(defn- encrypt-file
  [{:keys [inpath enc-dump-path enc-secret-path key-spec]}]
  (assert (and inpath enc-dump-path) "Needs both source and target file to encrypt.")
  (try
    (let [secret-key (or (:secret-key key-spec))
          pub-key (or (:pub-key-path key-spec))
          payload (slurp (io/file inpath))
          enc-payload (symm/encrypt payload secret-key)
          enc-secret (asymm/encrypt secret-key (asymm/pub-key pub-key))
          enc-out-path enc-dump-path
          enc-out-dec-path (str enc-dump-path ".dec.debug")
          _ (println "Writing encrypted content")
          _ (spit (io/file enc-out-path) enc-payload)
          enc-payload-decrypted (decrypt-payload (slurp (io/file enc-out-path)) secret-key)]

      (println "Writing encrypted secret")
      (spit (io/file enc-secret-path) enc-secret)
      (println "Writing decrypted content")
      (spit (io/file enc-out-dec-path) enc-payload-decrypted)
      (assert (same-contents? inpath enc-out-dec-path)))
    (catch Exception e
      (println "Error: " e))))


(defmacro ^:private with-entry
  [zip entry-name & body]
  `(let [^ZipOutputStream zip# ~zip]
     (.putNextEntry zip# (ZipEntry. ~entry-name))
     ~@body
     (flush)
     (.closeEntry zip#)))


(defn- zip-secure-dump
  [{:keys [enc-dump-path enc-secret-path zip-path]}]
  (println "Zipping " enc-dump-path enc-secret-path " --> " zip-path)
  (with-open [output (ZipOutputStream. (io/output-stream zip-path))
              input-dump (io/input-stream enc-dump-path)
              input-secret (io/input-stream enc-secret-path)]
    (with-entry output "dump.enc"
                (io/copy input-dump output))
    (with-entry output "secret.enc"
                (io/copy input-secret output))))

(defn- unzip-secure-dump [{:keys [zip-path dump-path secret-path]}]
  (println "Unzipping " zip-path " --> " dump-path secret-path)
  (let [stream (->
                 (io/input-stream zip-path)
                 (ZipInputStream.))]
    (loop [entry (.getNextEntry stream)]
      (when entry
        (let [entry-name (.getName entry)]
          (println "Unzipping " entry-name)
          (case entry-name
            "dump.enc" (io/copy stream (io/file dump-path))
            "secret.enc" (io/copy stream (io/file secret-path)))
          (recur (.getNextEntry stream)))))))

(defn uri->file [uri file]
  (println "Transfer: " uri " -> " file)
  (io/make-parents file)
  (with-open [in (io/input-stream uri)
              out (io/output-stream file)]
    (io/copy in out)))

(defn up! [s3-upload-url-str curr-db-conn-str]
  (let [

        zip-path "./dumps_out/dump.zip"

        ;;TODO we are relying on env vars for h2 dump location...
        ;;TODO call with ../..h2.db, end up with ..h2.db.mv.db, load-from-h2 without .mv.db
        generated-h2-path "./dumps_out/dump.h2.db.mv.db"
        enc-dump-path "./dumps_out/dump.enc"
        enc-secret-path "./dumps_out/dump.secret.enc"
        aes-secret "TODO_generate"
        s3-upload-url (URL. s3-upload-url-str)
        ;;TODO touch h2 file before running this
        _ (dump-to-h2/dump-to-h2! curr-db-conn-str nil)
        _ (encrypt-file {:inpath          generated-h2-path
                         :enc-dump-path   enc-dump-path
                         :enc-secret-path enc-secret-path
                         :key-spec        {:secret-key   aes-secret
                                           :pub-key-path "./keys/pub_key"}})
        _ (zip-secure-dump {:enc-dump-path   enc-dump-path
                            :enc-secret-path enc-secret-path
                            :zip-path        zip-path})
        _ (s3/upload-to-url s3-upload-url zip-path)

        ]
    (println "Done " s3-upload-url-str)))

(defn down! [h2-dump-path s3-bucket s3-key secret-key]
  (let [

        enc-dump-path "./dumps_in/dumped.enc"
        enc-secret-path "./dumps_in/dumped_secret.enc"
        zip-path "./dumps_in/dumped.zip"

        ;;Item will have been made public so we can download this
        _ (uri->file (format "https://%s.s3.amazonaws.com/%s" s3-bucket s3-key) zip-path)

        _ (unzip-secure-dump {:zip-path    zip-path
                              :dump-path   enc-dump-path
                              :secret-path enc-secret-path})

        enc-payload (slurp (io/file enc-dump-path))
        enc-payload-decrypted (decrypt-payload enc-payload secret-key)
        _ (spit (io/file h2-dump-path) enc-payload-decrypted)

        ;_ (println "Loading from H2 dump:")
        ;_ (metabase.cmd.load-from-h2/load-from-h2! h2-dump-path)
        ;; TODO load-from-h2!, will require a separate call using lein run, or should we just run it?

        ]
    (println "Done " h2-dump-path s3-bucket s3-key secret-key)))
