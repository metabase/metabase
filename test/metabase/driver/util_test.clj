(ns metabase.driver.util-test
  (:require [clojure.test :refer :all]
            [metabase.driver.util :as driver.u]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures])
  (:import java.nio.charset.StandardCharsets
           java.util.Base64))

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

(deftest connection-props-server->client-test
  (testing "connection-props-server->client works as expected for secret types"
    (doseq [[expected is-hosted?] [[[{:name "host"}
                                     {:name        "password-value"
                                      :type        "password"
                                      :placeholder "foo"
                                      :required    false}
                                     {:name "ssl"}
                                     {:name "use-keystore"
                                      :visible-if  {:ssl true}}
                                     {:name         "keystore-password-value"
                                      :display-name "Keystore Password",
                                      :type         "password",
                                      :required     false,
                                      :visible-if   {:use-keystore true
                                                     ;; this should have been filled in as a transitive dependency
                                                     :ssl          true}}
                                     {:name         "keystore-options"
                                      :display-name "Keystore"
                                      :options      [{:name  "Local file path"
                                                      :value "local"}
                                                     {:name  "Uploaded file path"
                                                      :value "uploaded"}]
                                      :type         "select"
                                      :default      "local"
                                      :visible-if   {:use-keystore true
                                                     :ssl          true}}
                                     {:name                 "keystore-value"
                                      :type                 "textFile"
                                      :treat-before-posting "base64"
                                      :visible-if           {:keystore-options "uploaded"}}
                                     {:name        "keystore-path"
                                      :type        "string"
                                      :visible-if  {:keystore-options "local"
                                                    :use-keystore true
                                                    :ssl          true}}]
                                    false]
                                   [[{:name "host"}
                                     {:name        "password-value"
                                      :type        "password"
                                      :placeholder "foo"
                                      :required    false}
                                     {:name "ssl"}
                                     {:name "use-keystore"
                                      :visible-if  {:ssl true}}
                                     {:name         "keystore-password-value"
                                      :display-name "Keystore Password"
                                      :type         "password"
                                      :required     false
                                      :visible-if   {:use-keystore true}}
                                     {:name                 "keystore-value"
                                      :type                 "textFile"
                                      :treat-before-posting "base64"
                                      :visible-if           {:use-keystore true}}]
                                    true]]]
      (testing (str " with is-hosted? " is-hosted?)
        ;; TODO: create capability to temporarily override token-features for testing
        (with-redefs [premium-features/is-hosted? (constantly is-hosted?)]
          (let [client-conn-props (-> (driver.u/available-drivers-info) ; this calls connection-props-server->client
                                      :secret-test-driver
                                      :details-fields)]
            (is (= expected (mt/select-keys-sequentially expected client-conn-props)))))))

    (testing "connection-props-server->client works as expected for info field types"
      (testing "info fields with placeholder defined are unmodified"
        (is (= [{:name "test", :type :info, :placeholder "placeholder"}]
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info, :placeholder "placeholder"}]))))

      (testing "info fields with getter defined invoke the getter to generate the placeholder"
        (is (= [{:name "test", :type :info, :placeholder "placeholder"}]
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info, :getter (constantly "placeholder")}]))))

      (testing "info fields are omitted if getter returns nil, a non-string value, or throws an exception"
        (is (= []
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info, :getter (constantly nil)}])))
        (is (= []
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info, :getter (constantly 0)}])))
        (is (= []
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info, :getter #(throw (Exception. "test error"))}])))
        (is (= []
               (driver.u/connection-props-server->client
                nil
                [{:name "test", :type :info}]))))))
  (testing "connection-props-server->client works as expected for the schema-filters type"
    (is (= [{:name "first-prop"}
            {:default      "all"
             :display-name "Schemas"
             :name         "my-schema-filters-type"
             :options      [{:name  "All" :value "all"}
                            {:name  "Only these..." :value "inclusion"}
                            {:name  "All except..." :value "exclusion"}]
             :type         "select"}
            {:name        "my-schema-filters-patterns"
             :placeholder "E.x. public,auth*"
             :description "Comma separated names of schemas that <strong>should</strong> appear in Metabase"
             :helper-text "You can use patterns like <strong>auth*</strong> to match multiple schemas"
             :type        "text"
             :visible-if  {:my-schema-filters-type "inclusion"}
             :required    true}
            {:name        "my-schema-filters-patterns"
             :placeholder "E.x. public,auth*"
             :description "Comma separated names of schemas that <strong>should NOT</strong> appear in Metabase"
             :helper-text "You can use patterns like <strong>auth*</strong> to match multiple schemas"
             :type        "text"
             :visible-if  {:my-schema-filters-type "exclusion"}
             :required    true}
            {:name "last-prop"}]
           (driver.u/connection-props-server->client
             nil
             [{:name "first-prop"}
              {:name         "my-schema-filters"
               :type         :schema-filters
               :display-name "Schemas"}
              {:name "last-prop"}]))))
  (testing "connection-props-server->client detects cycles in visible-if dependencies"
    (let [fake-props [{:name "prop-a", :visible-if {:prop-c "something"}}
                      {:name "prop-b", :visible-if {:prop-a "something else"}}
                      {:name "prop-c", :visible-if {:prop-b "something else entirely"}}]]
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Cycle detected"
            (driver.u/connection-props-server->client :fake-cyclic-driver fake-props))))))

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
