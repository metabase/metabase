(ns metabase.models.secret.keystore
  (:require [clojure.tools.logging :as log])
  (:import [java.io ByteArrayInputStream File FileOutputStream]
           java.security.KeyStore))

(defn get-jks-instance
  "Will probably be deleted"
  ^KeyStore [^bytes contents, ^chars store-password]
  (doto (KeyStore/getInstance "JKS")
    (.load (ByteArrayInputStream. contents) store-password)))

(defn store-jks-instance-to-temp-file
  "Will probably be deleted"
  ^File [^KeyStore jks-instance ^chars store-password]
  (let [temp-file (File/createTempFile "metabaseTemp_" ".jks")]
    (.deleteOnExit temp-file)
    (.store jks-instance (FileOutputStream. temp-file) store-password)
    temp-file))

(defn store-jks-contents-to-temp-file
  "Will probably be deleted"
  ^File [^bytes contents ^chars store-password]
  (store-jks-instance-to-temp-file (get-jks-instance contents store-password) store-password))

(defn valid-jks-file?
  "Returns true if the given file `contents`, along with the given `store-password`, constitute a valid Java `KeyStore`
  instance."
  [^bytes contents, ^chars store-password]
  (try
    (get-jks-instance contents store-password)
    true
    (catch Throwable e
      (log/errorf e "Invalid keystore: %s" (.getMessage e))
      false)))
