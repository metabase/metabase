(ns metabase.models.secret.keystore
  (:require [clojure.tools.logging :as log])
  (:import [java.security KeyStore]
           [java.io ByteArrayInputStream FileOutputStream File]))

(defn secret->jks-file
  [secret]
  ())

(defn get-jks-instance ^KeyStore [^bytes contents, ^chars store-password]
  (doto (KeyStore/getInstance "JKS")
    (.load (ByteArrayInputStream. contents) store-password)))

(defn store-jks-instance-to-temp-file ^File
  [^KeyStore jks-instance ^chars store-password]
  (let [temp-file (File/createTempFile "metabaseTemp_" ".jks")]
    (.deleteOnExit temp-file)
    (.store jks-instance (FileOutputStream. temp-file) store-password)
    temp-file))

(defn store-jks-contents-to-temp-file ^File
  [^bytes contents ^chars store-password]
  (store-jks-instance-to-temp-file (get-jks-instance contents store-password) store-password))

(defn valid-jks-file? [^bytes contents, ^chars store-password]
  (try
    (get-jks-instance contents store-password)
    true
    (catch Throwable e
      (log/errorf e "Invalid keystore: %s" (.getMessage e))
      false)))

