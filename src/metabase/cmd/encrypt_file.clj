(ns metabase.cmd.encrypt-file
  (:require [metabase.cmd.encrypt-asymm :as asymm]
            [clojure.java.io :as io]
            [metabase.cmd.encrypt-symm :as symm]))


(defn- same-contents? [file1 file2]
  (= (slurp (io/file file1))
     (slurp (io/file file2))))

(defn encrypt-file [{:keys [inpath outpath key-spec]}]
  (assert (and inpath outpath) "Needs both source and target file to encrypt.")
  (try
    (let [secret-key (or (:secret-key key-spec))
          pub-key (or (:pub-key-path key-spec))
          private-key (or (:private-key-path key-spec))
          payload (slurp (io/file inpath))
          enc-payload (symm/encrypt payload secret-key)
          enc-payload-decrypted (symm/decrypt enc-payload secret-key)
          enc-secret (asymm/encrypt secret-key (asymm/pub-key pub-key))
          dec-secret (asymm/decrypt enc-secret (asymm/private-key private-key))
          enc-out-path outpath
          enc-secret-path (str outpath ".secret.enc")
          enc-secret-dec-path (str outpath ".secret.dec")
          enc-out-dec-path (str outpath ".dec")]
      (println "Writing encrypted content")
      (spit (io/file enc-out-path) enc-payload)
      (println "Writing encrypted secret")
      (spit (io/file enc-secret-path) enc-secret)
      (println "Writing decrypted secret")
      (spit (io/file enc-secret-dec-path) dec-secret)
      (println "Writing decrypted content")
      (spit (io/file enc-out-dec-path) enc-payload-decrypted)
      (assert (same-contents? inpath enc-out-dec-path) "Encrypted contents decrypted again have the same contents.")
      (assert (= secret-key dec-secret) "Encrypted secret descrypted again should have same contents."))
    (catch Exception e
      (println "Error: " e))))


(encrypt-file {:inpath   "./keys/file.txt"
               :outpath  "./keys/file.txt.aes.enc"
               :key-spec {:secret-key       "mysecretkey"
                          :pub-key-path     "./keys/mig_pub_key"
                          :private-key-path "./keys/mig_private_key"}})

