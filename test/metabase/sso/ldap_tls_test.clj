(ns metabase.sso.ldap-tls-test
  "LDAPS/StartTLS connections validate the directory server's certificate against a trust store."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.sso.ldap :as ldap]
   [metabase.test :as mt])
  (:import
   (com.unboundid.ldap.listener InMemoryDirectoryServer
                                InMemoryDirectoryServerConfig
                                InMemoryListenerConfig
                                SelfSignedCertificateGenerator)
   (com.unboundid.ldap.sdk LDAPConnectionOptions)
   (com.unboundid.util ObjectPair)
   (com.unboundid.util.ssl HostNameSSLSocketVerifier KeyStoreKeyManager SSLUtil TrustAllTrustManager)
   (java.io File)
   (java.security KeyStore Security)))

(set! *warn-on-reflection* true)

(defn- self-signed-keystore
  "Generate a temporary keystore holding a self-signed `localhost` certificate. Returns the
  UnboundID pair of [keystore-file password]. Uses the JVM default keystore type so the same file
  can back both the listener's key manager and a client trust store."
  []
  (SelfSignedCertificateGenerator/generateTemporarySelfSignedCertificate "localhost" (KeyStore/getDefaultType)))

(defn- start-ldaps-server!
  "Start an in-memory LDAPS directory whose listener presents `pair`'s self-signed certificate."
  ^InMemoryDirectoryServer [^ObjectPair pair]
  (let [key-mgr    (KeyStoreKeyManager. ^File (.getFirst pair) ^chars (.getSecond pair))
        server-ssl (SSLUtil. key-mgr (TrustAllTrustManager.))
        client-ssl (SSLUtil. (TrustAllTrustManager.))
        listener   (InMemoryListenerConfig/createLDAPSConfig
                    "LDAPS" nil (int 0)
                    (.createSSLServerSocketFactory server-ssl)
                    (.createSSLSocketFactory client-ssl))
        base-dns   ^"[Ljava.lang.String;" (into-array String ["dc=example,dc=com"])
        listeners  ^"[Lcom.unboundid.ldap.listener.InMemoryListenerConfig;" (into-array InMemoryListenerConfig [listener])
        cfg        (doto (InMemoryDirectoryServerConfig. base-dns)
                     (.setListenerConfigs listeners))]
    (doto (InMemoryDirectoryServer. cfg)
      (.startListening))))

(defn- trust-store-with-cert!
  "Write a temp trust store whose only trusted entry is the certificate held in `pair`'s keystore, so
  a client configured with it validates the matching server. The LDAP client reads the trust store
  with a null password (clj-ldap's `TrustStoreTrustManager`), and JDK PKCS12 encrypts certificate
  entries by default — which a null-password read can't decrypt. So store the cert unencrypted, the
  way the JVM `cacerts` file is stored. Returns the trust store path."
  ^String [^ObjectPair pair]
  (let [pw       ^chars (.getSecond pair)
        src      ^KeyStore (doto ^KeyStore (KeyStore/getInstance (KeyStore/getDefaultType))
                             (.load (io/input-stream (.getFirst pair)) pw))
        cert     (.getCertificate src (first (enumeration-seq (.aliases src))))
        trust    ^KeyStore (doto ^KeyStore (KeyStore/getInstance "pkcs12")
                             (.load nil nil)
                             (.setCertificateEntry "ldap-ca" cert))
        out      ^File (File/createTempFile "ldap-trust" ".ks")
        cert-alg (Security/getProperty "keystore.pkcs12.certProtectionAlgorithm")
        mac-alg  (Security/getProperty "keystore.pkcs12.macAlgorithm")]
    (try
      (Security/setProperty "keystore.pkcs12.certProtectionAlgorithm" "NONE")
      (Security/setProperty "keystore.pkcs12.macAlgorithm" "NONE")
      (with-open [os (io/output-stream out)]
        (.store trust os (char-array 0)))
      (finally
        (Security/setProperty "keystore.pkcs12.certProtectionAlgorithm" (or cert-alg "PBEWithHmacSHA256AndAES_256"))
        (Security/setProperty "keystore.pkcs12.macAlgorithm" (or mac-alg "HmacPBESHA256"))))
    (.getPath out)))

(deftest ldaps-verifies-server-hostname-test
  (testing "TLS connections are configured to verify the server certificate matches the connected host"
    (let [^LDAPConnectionOptions opt (#'ldap/ldap-connection-options)]
      (is (instance? HostNameSSLSocketVerifier (.getSSLSocketVerifier opt))
          "a hostname verifier must be installed so a certificate issued for another host is rejected"))))

(deftest ldaps-validates-server-certificate-test
  (let [pair (self-signed-keystore)
        ds   (start-ldaps-server! pair)]
    (try
      (let [port    (.getListenPort ds "LDAPS")
            ks-path (trust-store-with-cert! pair)]
        (testing "a certificate absent from the trust store fails the TLS handshake"
          (mt/with-temporary-setting-values [ldap-host     "localhost"
                                             ldap-port     port
                                             ldap-security :ssl]
            (is (thrown? Exception
                         (with-open [^java.lang.AutoCloseable _conn (#'ldap/get-connection)]))
                "a certificate outside the trust store must not complete the TLS handshake")))
        (testing "a certificate present in the configured trust store connects (positive control)"
          (mt/with-temporary-setting-values [ldap-host        "localhost"
                                             ldap-port        port
                                             ldap-security    :ssl
                                             ldap-trust-store ks-path]
            (with-open [^java.lang.AutoCloseable conn (#'ldap/get-connection)]
              (is (some? conn)
                  "a certificate in the trust store must complete the handshake and connect")))))
      (finally
        (.shutDown ds true)))))
