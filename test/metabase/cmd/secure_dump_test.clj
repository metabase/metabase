(ns metabase.cmd.secure-dump-test
  (:require [expectations :refer [expect]]
            [flatland.ordered.map :as ordered-map]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.cmd.secure-dump :as secure-dump]
            [metabase.plugins.classloader :as classloader]
            [toucan
             [db :as db]
             [models :as models]]
            [clojure.java.io :as io]
            [metabase.crypto.asymmetric :as asymm]
            [metabase.crypto.symmetric :as symm]))

(def public-key "./keys/mig_pub_key")
(def private-key "./keys/mig_private_key")
(def enc-dump-path "./keys/dump__file.txt.aes.enc")
(def enc-secret-path "./keys/dump_secret__file.txt.aes.enc")
(def zip-path "./keys/dump.zip")
(def unenc-path "./keys/file.txt")
(def secret-key "mysecretkey")
(def unzipped-dump-path "./keys/dump__unzip.enc")
(def unzipped-secret-path "./keys/dump_secret__unzip.enc")
(def unzipped-dec-dump-path "./keys/result_file.txt.aes.enc.dec")

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

(expect
  (slurp (io/file unenc-path))
  (do
    (#'secure-dump/encrypt-file
      {:inpath          unenc-path
       :enc-dump-path   enc-dump-path
       :enc-secret-path enc-secret-path
       :key-spec        {:secret-key       secret-key
                         :pub-key-path     public-key
                         :private-key-path private-key}})
    (symm/decrypt (slurp enc-dump-path) secret-key)))

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




