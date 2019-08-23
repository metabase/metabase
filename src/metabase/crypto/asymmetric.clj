(ns metabase.crypto.asymmetric
  (:import (java.util Base64)
           (java.security KeyPair KeyFactory KeyPairGenerator)
           (java.security.spec X509EncodedKeySpec PKCS8EncodedKeySpec)
           (java.io File)
           (java.nio.file Files)
           (javax.crypto Cipher)))


(def cipher-algorithm "RSA/ECB/PKCS1Padding")

(def cipher (Cipher/getInstance cipher-algorithm))

(defn decode64 [str]
  (.decode (Base64/getDecoder) str))

(defn encode64 [bytes]
  (.encodeToString (Base64/getEncoder) bytes))

(defn encrypt [message public-key]
  (println "Encrypt: " (count message) public-key)
  (encode64
    (let [the-bytes (.getBytes message)
          _ (println "Bytes: " (count message) message)
          cipher (doto cipher
                   (.init Cipher/ENCRYPT_MODE public-key))]
      (.doFinal cipher the-bytes))))

(defn decrypt [message private-key]
  (let [cipher (doto cipher
                 (.init Cipher/DECRYPT_MODE private-key))]
    (->> message
         decode64
         (.doFinal cipher)
         (map char)
         (apply str))))

(defn new-pair []
  (println "New keypair")
  (let [gk (doto (KeyPairGenerator/getInstance "RSA")
             (.initialize 8192))
        pair (.generateKeyPair gk)]
    pair))


(defn pub-key [^String public-key-path]
  (println "Loading existing pub key")
  (let [pub-byes (Files/readAllBytes (.toPath (File. public-key-path)))
        pub-spec (X509EncodedKeySpec. pub-byes)
        pub-kf (KeyFactory/getInstance "RSA")
        pub-key (.generatePublic pub-kf pub-spec)]
    pub-key))

(defn private-key [^String private-key-path]
  (println "Loading existing private key")
  (let [priv-byes (Files/readAllBytes (.toPath (File. private-key-path)))
        priv-spec (PKCS8EncodedKeySpec. priv-byes)
        priv-kf (KeyFactory/getInstance "RSA")
        priv-key (.generatePrivate priv-kf priv-spec)]
    priv-key))

(defn existing-pair [^String private-key-path ^String public-key-path]
  (println "Loading existing keypair")
  (KeyPair. (pub-key public-key-path) (private-key private-key-path)))

(defn write-key [^String path key-data txt? priv?]
  (println "Writing key" path)
  (with-open [o (clojure.java.io/output-stream path :encoding "UTF-8")]
    (when txt?
      (.write o (.getBytes (if priv? "-----BEGIN PRIVATE KEY-----" "-----BEGIN PUBLIC KEY-----")))
      (.write o (.getBytes "\n")))
    (.write o (if (string? key-data)
                (.getBytes key-data)
                key-data))
    (when txt?
      (.write o (.getBytes "\n"))
      (.write o (.getBytes (if priv? "-----END PRIVATE KEY-----" "-----END PUBLIC KEY-----"))))
    (.flush o)))

(defn ^KeyPair gen-keys
  [& [{:keys [private-key-path public-key-path
              private-key-out-text-path private-key-out-bin-path
              public-key-out-text-path public-key-out-bin-path]
       :or   {private-key-out-text-path "./keys/private_key.txt"
              private-key-out-bin-path  "./keys/private_key"
              public-key-out-text-path  "./keys/pub_key.txt"
              public-key-out-bin-path   "./keys/pub_key"}}]]
  (let [pair (if (and private-key-path public-key-path)
               (existing-pair private-key-path public-key-path)
               (new-pair))
        priv-encoded (-> (Base64/getMimeEncoder) (.encodeToString (-> pair .getPrivate .getEncoded)))
        priv-bytes (-> pair .getPrivate .getEncoded)
        pub-encoded (-> (Base64/getMimeEncoder) (.encodeToString (-> pair .getPublic .getEncoded)))
        pub-bytes (-> pair .getPublic .getEncoded)]
    (write-key public-key-out-text-path pub-encoded true false)
    (write-key public-key-out-bin-path pub-bytes false false)
    (write-key private-key-out-text-path priv-encoded true true)
    (write-key private-key-out-bin-path priv-bytes false true)
    pair))
