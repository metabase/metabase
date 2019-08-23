(ns metabase.cmd.secure-dump
  (:require [clojure.java.io :as io]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.s3 :as s3])
  (:import (java.util.zip ZipEntry ZipOutputStream ZipInputStream)))

(defn- same-contents? [file1 file2]
  (= (slurp (io/file file1))
     (slurp (io/file file2))))

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
          enc-payload-decrypted (symm/decrypt enc-payload secret-key)
          enc-secret (asymm/encrypt secret-key (asymm/pub-key pub-key))
          enc-out-path enc-dump-path
          enc-out-dec-path (str enc-dump-path ".dec.debug")]
      (println "Writing encrypted content")
      (spit (io/file enc-out-path) enc-payload)
      (println "Writing encrypted secret")
      (spit (io/file enc-secret-path) enc-secret)
      (println "Writing decrypted content")
      (spit (io/file enc-out-dec-path) enc-payload-decrypted))
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


(defn up! []
  (let [curr-db-conn-str "TODO"
        generated-h2-path "TODO"
        enc-dump-path "TODO"
        enc-secret-path "TODO"
        aes-secret "TODO"
        zip-path "TODO"
        s3-bucket "TODO"
        s3-key "TODO"
        _ (dump-to-h2/dump-to-h2! curr-db-conn-str generated-h2-path)
        _ (encrypt-file {:inpath          generated-h2-path
                         :enc-dump-path   enc-dump-path
                         :enc-secret-path enc-secret-path
                         :key-spec        {:secret-key       aes-secret
                                           :pub-key-path     "./keys/pub_key"
                                           :private-key-path "./keys/private_key"}})
        _ (zip-secure-dump {:enc-dump-path   enc-dump-path
                            :enc-secret-path enc-secret-path
                            :zip-path        zip-path})
        _ (s3/upload zip-path s3-bucket s3-key)

        ]))

(defn down! []
  (let [enc-dump-path "TODO"
        enc-secret-path "TODO"
        zip-path "TODO"
        dec-dump "TODO"
        s3-bucket "TODO"
        s3-key "TODO"
        _ (s3/download zip-path s3-bucket s3-key)
        _ (unzip-secure-dump {:zip-path    zip-path
                              :dump-path   enc-dump-path
                              :secret-path enc-secret-path})
        _ (decrypt-file {:enc-dump-path   enc-dump-path
                         :outpath         dec-dump
                         :enc-secret-path enc-secret-path
                         :key-spec        {:pub-key-path     "./keys/pub_key"
                                           :private-key-path "./keys/private_key"}})
        ;; TODO load-from-h2! with dec-dump as arg
        ]))


(defn- DEMO []
  (let [enc-dump-path "./keys/dump__file.txt.aes.enc"
        enc-secret-path "./keys/dump_secret__file.txt.aes.enc"
        zip-path "./keys/dump.zip"]

    (encrypt-file {:inpath          "./keys/file.txt"
                   :enc-dump-path   enc-dump-path
                   :enc-secret-path enc-secret-path
                   :key-spec        {:secret-key       "mysecretkey"
                                     :pub-key-path     "./keys/pub_key"
                                     :private-key-path "./keys/private_key"}})

    (zip-secure-dump {:enc-dump-path   enc-dump-path
                      :enc-secret-path enc-secret-path
                      :zip-path        zip-path})
    (unzip-secure-dump {:zip-path    zip-path
                        :dump-path   "./keys/dump__unzip.enc"
                        :secret-path "./keys/dump_secret__unzip.enc"})

    (decrypt-file {:enc-dump-path   "./keys/dump__unzip.enc"
                   :outpath         "./keys/result_file.txt.aes.enc.dec"
                   :enc-secret-path "./keys/dump_secret__unzip.enc"
                   :key-spec        {:pub-key-path     "./keys/pub_key"
                                     :private-key-path "./keys/private_key"}})))

(comment

  (DEMO)

  )
