(ns metabase.cmd.secure-dump-test
  (:require [clojure.java.io :as io]
            [expectations :refer [expect]]
            [metabase.cmd.secure-dump :as secure-dump]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]))

(def public-key "./test_resources/crypto/pub_key")
(def private-key "./test_resources/crypto/private_key")
(def enc-dump-path "./test_resources/crypto/dump__file.txt.aes.enc")
(def enc-secret-path "./test_resources/crypto/dump_secret__file.txt.aes.enc")
(def zip-path "./test_resources/crypto/dump.zip")
(def unenc-path "./test_resources/crypto/file.txt")
(def secret-key "mysecretkey")
(def unzipped-dump-path "./test_resources/crypto/dump__unzip.enc")
(def unzipped-secret-path "./test_resources/crypto/dump_secret__unzip.enc")
(def unzipped-dec-dump-path "./test_resources/crypto/result_file.txt.aes.enc.dec")

;; After encrypting a dump file, the resulting encrypted secret
;; used to encrypt the dump can be decrypted using the private
;; key used to encrypt it.
(expect
  secret-key
  (do
    (#'secure-dump/encrypt-file
      {:inpath          unenc-path
       :enc-dump-path   enc-dump-path
       :enc-secret-path enc-secret-path
       :key-spec        {:secret-key       secret-key
                         :pub-key-path     public-key
                         :private-key-path private-key}})
    (asymm/decrypt (slurp enc-secret-path) (asymm/private-key private-key))))

;; After encrypting a dump file, the resulting encrypted dump
;; should be decryptable using the original secret key.
(expect
  (slurp (io/file unenc-path))
  (do
    (#'secure-dump/encrypt-file
      {:inpath          unenc-path
       :enc-dump-path   enc-dump-path
       :enc-secret-path enc-secret-path
       :key-spec        {:secret-key       secret-key
                         :pub-key-path     public-key}})
    (symm/decrypt (slurp enc-dump-path) secret-key)))

;; After zipping, unzipping, and decrypting, the encrypted dump
;; from the zip should be decryptable using the unencrypted
;; secret key from the zip.
(expect
  (slurp (io/file unenc-path))
  (do
    (#'secure-dump/zip-secure-dump {:enc-dump-path   enc-dump-path
                                    :enc-secret-path enc-secret-path
                                    :zip-path        zip-path})
    (#'secure-dump/unzip-secure-dump {:zip-path    zip-path
                                      :dump-path   unzipped-dump-path
                                      :secret-path unzipped-secret-path})
    (#'secure-dump/decrypt-file {:enc-dump-path   unzipped-dump-path
                                 :outpath         unzipped-dec-dump-path
                                 :enc-secret-path unzipped-secret-path
                                 :key-spec        {:pub-key-path     public-key
                                                   :private-key-path private-key}})

    (symm/decrypt (slurp unzipped-dump-path)
                  (asymm/decrypt (slurp unzipped-secret-path)
                                 (asymm/private-key private-key)))))




