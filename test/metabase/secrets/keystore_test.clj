(ns metabase.secrets.keystore-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream)
   (java.nio.charset StandardCharsets)
   (java.security KeyStore KeyStore$PasswordProtection KeyStore$SecretKeyEntry)
   (javax.crypto SecretKey)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

(defn create-test-jks-instance
  "Creates a JKS instance and stores the given `entries` in it, using the given `ks-password` as the store password.
  `entries` is a map from entry names to private key values. The KeyStore will be in PKCS12 format, for easier storage
  and retrieval of arbitrary secret key data. Individual entries will be stored with password protection using
  `ks-password` (a bad idea in production, but fine for tests)."
  {:added "0.41.0"}
  ^KeyStore [^String ks-password entries]
  (let [pw                  (.toCharArray ks-password)
        protection          (KeyStore$PasswordProtection. pw)
        ^KeyStore key-store (doto (KeyStore/getInstance "PKCS12")
                              (.load nil pw))]
    (doseq [[^String alias ^String value] entries]
      (.setEntry key-store
                 alias
                 (-> (SecretKeySpec. (.getBytes value StandardCharsets/UTF_8) "AES")
                     (KeyStore$SecretKeyEntry.))
                 protection))
    key-store))

(defn bytes->keystore
  "Initializes and returns a `KeyStore` instance from the given `ks-bytes` (keystore contents) and `ks-password`."
  {:added "0.41.0"}
  ^KeyStore [^bytes ks-bytes ^chars ks-password]
  (doto (KeyStore/getInstance (KeyStore/getDefaultType))
    (.load (io/input-stream ks-bytes) ks-password)))

(defn- assert-entries [^String protection-password ^KeyStore ks entries]
  (let [protection (KeyStore$PasswordProtection. (.toCharArray protection-password))]
    (doseq [[k v] entries]
      (let [^KeyStore$SecretKeyEntry entry (.getEntry ks k protection)
            ^SecretKey secret-key          (.getSecretKey entry)]
        (is (= v (String. (.getEncoded secret-key) StandardCharsets/UTF_8)))))))

(deftest secret-keystore-type-test
  (testing "A secret with :type :keystore can be saved and loaded properly"
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (with-open [baos (ByteArrayOutputStream.)]
        (let [key-alias "my-secret-key"
              key-value "cromulent"
              ks-pw     "embiggen"
              _         (doto (create-test-jks-instance ks-pw {key-alias key-value})
                          (.store baos (.toCharArray ks-pw)))
              ks-bytes (.toByteArray baos)]
          (mt/with-temp [:model/Database {:keys [details] :as database} {:engine  :secret-test-driver
                                                                         :name    "Test DB with keystore"
                                                                         :details {:host                    "localhost"
                                                                                   :keystore-value          (mt/bytes->base64-data-uri ks-bytes)
                                                                                   :keystore-password-value ks-pw}}]
            (is (some? database))
            (is (not (contains? details :keystore-value)) "keystore-value was removed from details")
            (is (contains? details :keystore-id) "keystore-id was added to details")
            (is (not (contains? details :keystore-password-value)) ":keystore-password-value was removed from details")
            (is (contains? details :keystore-password-id) ":keystore-password-id was added to details")
            (let [{ks-pw-bytes :value} (t2/select-one :model/Secret :id (:keystore-password-id details))
                  ks-pw-str            (String. ^bytes ks-pw-bytes StandardCharsets/UTF_8)
                  {:keys [value]}      (t2/select-one :model/Secret :id (:keystore-id details))
                  ks                   (bytes->keystore value (.toCharArray ks-pw-str))]
              (is (= (seq ks-bytes) (seq value)))
              (assert-entries ks-pw-str ks {key-alias key-value}))))))))
