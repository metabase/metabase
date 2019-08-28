(ns metabase.cmd.secure-dump-test
  (:require [clojure.java.io :as io]
            [expectations :refer [expect]]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]
            [me.raynes.fs :as fs]
            [metabase.cmd.dump-upload :as up]
            [metabase.cmd.dump-download :as down])
  (:import (java.io ByteArrayOutputStream)))


(defn- file->bytes ^bytes [file]
  (with-open [xin (io/input-stream file)
              xout (ByteArrayOutputStream.)]
    (io/copy xin xout)
    (.toByteArray xout)))

(def unenc-path "./test_resources/crypto/dump.h2.db.mv.db")
(def public-key "./test_resources/crypto/pub_key")
(def private-key "./test_resources/crypto/private_key")

(def enc-dump-path "./test_resources/crypto/dump-test/dump__h2.aes.enc")
(def enc-secret-path "./test_resources/crypto/dump-test/dump_secret__h2.aes.enc")
(def zip-path "./test_resources/crypto/dump-test/dump.zip")
(def secret-key "mysecretkey")
(def unzipped-dump-path "./test_resources/crypto/dump-test/dump__unzip.enc")
(def unzipped-secret-path "./test_resources/crypto/dump-test/dump_secret__unzip.enc")
(def unzipped-dec-dump-path "./test_resources/crypto/dump-test/result_h2.aes.enc.dec")

(defn- clean-up []
  (fs/delete-dir "./test_resources/crypto/dump-test")
  (fs/mkdir "./test_resources/crypto/dump-test"))

(clean-up)
;; After encrypting a dump file, the resulting encrypted secret
;; used to encrypt the dump can be decrypted using the private
;; key used to encrypt it.
(expect
  secret-key
  (do
    (#'up/encrypt-file
      {:inpath          unenc-path
       :enc-dump-path   enc-dump-path
       :enc-secret-path enc-secret-path
       :key-spec        {:secret-key   secret-key
                         :pub-key-path public-key}})
    (asymm/decrypt (slurp enc-secret-path) (asymm/private-key private-key))))

;; After encrypting a dump file, the resulting encrypted dump
;; should be decryptable using the original secret key.
(expect
  (seq (file->bytes unenc-path))
  (do
    (#'up/encrypt-file
      {:inpath          unenc-path
       :enc-dump-path   enc-dump-path
       :enc-secret-path enc-secret-path
       :key-spec        {:secret-key   secret-key
                         :pub-key-path public-key}})
    (seq (symm/decrypt-b64-bytes (file->bytes enc-dump-path) secret-key))))

;; After zipping, unzipping, and decrypting, the encrypted dump
;; from the zip should be decryptable using the unencrypted
;; secret key from the zip.
(expect
  (seq (file->bytes unenc-path))
  (do
    (#'up/zip-secure-dump {:enc-dump-path   enc-dump-path
                           :enc-secret-path enc-secret-path
                           :zip-path        zip-path})
    (#'down/unzip-secure-dump {:zip-path    zip-path
                               :dump-path   unzipped-dump-path
                               :secret-path unzipped-secret-path})
    (let [secret (asymm/decrypt (slurp unzipped-secret-path) (asymm/private-key private-key))]

      (#'down/decrypt-payload-bytes (file->bytes enc-dump-path) secret)

      (let [unenc-bytes (seq (symm/decrypt-b64-bytes (file->bytes unzipped-dump-path) secret))]
        (clean-up)
        unenc-bytes))))




