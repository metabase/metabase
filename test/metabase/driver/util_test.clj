(ns metabase.driver.util-test
  (:require [clojure.test :refer :all]
            [flatland.ordered.map :as ordered-map]
            [metabase.driver.util :as driver.u]
            [metabase.test.fixtures :as fixtures]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.test :as mt])
  (:import (java.util Base64)
           (java.nio.charset StandardCharsets)))

(use-fixtures :once (fixtures/initialize :plugins :test-drivers))

;; if the CA certificate (ca.pem) used in this test is regenerated,
;; you'll need to update this DN
(def ^:private test-ca-dn
  "ou=www,o=someone,l=seattle,st=washington,c=us")

;; if the server certificate (server.pem) used in this test is regenerated,
;; you'll need to update this DN
(def ^:private test-server-dn
  "cn=server.local,ou=www,o=someone,l=seattle,st=washington,c=us")

(deftest test-generate-keystore-with-cert
  (testing "a proper CA file is read"
    (let [cert-string (slurp "./test_resources/ssl/ca.pem")
          keystore (driver.u/generate-keystore-with-cert cert-string)]
      (is (true? (.containsAlias keystore test-ca-dn)))))

  (testing "bad cert provided"
    (is (thrown? java.security.cert.CertificateException
                 (driver.u/generate-keystore-with-cert "fooobar"))))

  (testing "multiple certs are read"
    (let [cert-string (str (slurp "./test_resources/ssl/ca.pem")
                           (slurp "./test_resources/ssl/server.pem"))
          keystore (driver.u/generate-keystore-with-cert cert-string)]
      (is (true? (.containsAlias keystore test-server-dn)))
      (is (true? (.containsAlias keystore test-ca-dn)))))

  (testing "can create SocketFactory for CA cert"
    ;; this is a tough method to test - the resulting `SSLSocketFactory`
    ;; doesn't have any public members to access the underlying `KeyStore`
    ;; so the best we can do is make sure it doesn't throw anything on
    ;; execution
    (is (instance? javax.net.ssl.SSLSocketFactory
                   (driver.u/socket-factory-for-cert (slurp "./test_resources/ssl/ca.pem"))))))

;; simply to save a lot of characters below
(def ^:private om ordered-map/ordered-map)

(deftest translate-conn-props-server->client-test
  (testing "connection-props-server->client works as expected"
    (doseq [[expected is-hosted?] [[[(om :name "host", :display-name "Host", :placeholder "localhost")
                                     (om :name "password-value", :display-name "Password", :type "password",
                                         :placeholder "foo", :required false)
                                     (om :name "use-keystore", :type "boolean", :display-name "Use Keystore?")
                                     (om :name "keystore-password-value", :display-name "Keystore Password",
                                         :type "password", :required false, :visible-if (om :use-keystore true))
                                     ;; not an ordered-map because this property was added
                                     {:default "local"
                                      :name    "keystore-options"
                                      :options [{:name  "Local file path"
                                                 :value "local"}
                                                {:name  "Uploaded file path"
                                                 :value "uploaded"}]
                                      :type    "select"}
                                     ;; keystore-value
                                     (om :name "keystore-value", :display-name "Keystore", :type "textFile",
                                         :required false,
                                         :treat-before-posting "base64", :visible-if {:keystore-options "uploaded"})
                                     {:name        "keystore-path"
                                      :placeholder nil
                                      :type        "string"
                                      :visible-if  {:keystore-options "local"}}]
                                    false]
                                   [[(om :name "host", :display-name "Host", :placeholder "localhost")
                                     (om :name "password-value", :display-name "Password", :type "password",
                                         :placeholder "foo", :required false)
                                     (om :name "use-keystore", :type "boolean", :display-name "Use Keystore?")
                                     (om :name "keystore-password-value", :display-name "Keystore Password",
                                         :type "password", :required false,
                                         :visible-if (om :use-keystore true))
                                     (om :name "keystore-value", :display-name "Keystore", :type "textFile",
                                         :required false, :treat-before-posting "base64",
                                         :visible-if (om :use-keystore true))]
                                    true]]]
      (testing (str "with is-hosted? " is-hosted?)
        ;; TODO: create capability to temporarily override token-features for testing
        (with-redefs [premium-features/is-hosted? (constantly is-hosted?)]
          (let [client-conn-props (-> (driver.u/available-drivers-info) ; this calls connection-props-server->client
                                      :secret-test-driver
                                      :details-fields)]
            (is (= expected client-conn-props))))))))

(deftest connection-details-client->server-test
  (testing "db-details-client->server works as expected"
    (let [ks-val      "super duper secret keystore" ; not a real KeyStore "value" (which is a binary thing), but good
                                                    ; enough for our test purposes here
          db-details {:host                    "other-host"
                      :password-value          "super-secret-pw"
                      :use-keystore            true
                      :keystore-options        "uploaded"
                      ;; because treat-before-posting is base64 in the config for this property, simulate that happening
                      :keystore-value          (->> (.getBytes ks-val StandardCharsets/UTF_8)
                                                    (.encodeToString (Base64/getEncoder)))
                      :keystore-password-value "my-keystore-pw"}
          transformed (driver.u/db-details-client->server :secret-test-driver db-details)]
      ;; compare all fields except `:keystore-value` as a single map
      (is (= {:host                    "other-host"
              :password-value          "super-secret-pw"
              :keystore-password-value "my-keystore-pw"
              :use-keystore            true}
             (select-keys transformed [:host :password-value :keystore-password-value :use-keystore])))
      ;; the keystore-value should have been base64 decoded because of treat-before-posting being base64 (see above)e
      (is (mt/secret-value-equals? ks-val (:keystore-value transformed))))))
