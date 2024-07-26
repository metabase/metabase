(ns metabase.driver.util-test
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-provider :as auth-provider]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.util :as driver.u]
   [metabase.http-client :as client]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util Base64)
   (javax.net.ssl SSLSocketFactory)))

(comment h2/keep-me)

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins :test-drivers))

(deftest ^:parallel generate-identity-store-test
  (testing "proper key and cert files are read"
    (let [key-string (-> "ssl/mongo/metabase.key" io/resource slurp)
          key-passw "passw"
          cert-string (-> "ssl/mongo/metabase.crt" io/resource slurp)
          key-store (driver.u/generate-identity-store key-string key-passw cert-string)
          [alias & alien-aliases] (-> key-store .aliases enumeration-seq)]
      (is (string? alias))
      (is (str/ends-with? alias "cn=localhost,ou=metabase,o=metabase inc.,l=san francisco,st=ca,c=us"))
      (is (empty? alien-aliases))
      (is (some? (.getCertificate key-store alias)))
      (is (some? (.getKey key-store alias (char-array key-passw)))))))

;; if the CA certificate (ca.pem) used in this test is regenerated,
;; you'll need to update this DN
(def ^:private test-ca-dn
  "ou=www,o=someone,l=seattle,st=washington,c=us")

;; if the server certificate (server.pem) used in this test is regenerated,
;; you'll need to update this DN
(def ^:private test-server-dn
  "cn=server.local,ou=www,o=someone,l=seattle,st=washington,c=us")

(deftest ^:parallel generate-trust-store-test
  (testing "a proper CA file is read"
    (let [cert-string (slurp "./test_resources/ssl/ca.pem")
          keystore (driver.u/generate-trust-store cert-string)]
      (is (true? (.containsAlias keystore test-ca-dn)))))

  (testing "bad cert provided"
    (is (thrown? java.security.cert.CertificateException
                 (driver.u/generate-trust-store "fooobar"))))

  (testing "multiple certs are read"
    (let [cert-string (str (slurp "./test_resources/ssl/ca.pem")
                           (slurp "./test_resources/ssl/server.pem"))
          keystore (driver.u/generate-trust-store cert-string)]
      (is (.containsAlias keystore test-server-dn))
      (is (.containsAlias keystore test-ca-dn))))

  (testing "can create SocketFactory for CA cert"
    ;; this is a tough method to test - the resulting `SSLSocketFactory`
    ;; doesn't have any public members to access the underlying `KeyStore`
    ;; so the best we can do is make sure it doesn't throw anything on
    ;; execution
    (is (instance? javax.net.ssl.SSLSocketFactory
                   (driver.u/ssl-socket-factory :trust-cert (slurp "./test_resources/ssl/ca.pem"))))))

(deftest ^:parallel ssl-socket-factory-test
  (testing "can create socket factory from identity and trust info"
    (is (instance? SSLSocketFactory
                   (driver.u/ssl-socket-factory
                    :private-key (-> "ssl/mongo/metabase.key" io/resource slurp)
                    :password "passw"
                    :own-cert (-> "ssl/mongo/metabase.crt" io/resource slurp)
                    :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp)))))
  (testing "can create socket factory from just trust info"
    (is (instance? SSLSocketFactory
                   (driver.u/ssl-socket-factory
                    :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp)))))
  (testing "can create socket factory from just identity info"
    (is (instance? SSLSocketFactory
                   (driver.u/ssl-socket-factory
                    :private-key (-> "ssl/mongo/metabase.key" io/resource slurp)
                    :password "passw"
                    :own-cert (-> "ssl/mongo/metabase.crt" io/resource slurp))))))

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
        (mt/with-premium-features (if is-hosted? #{:hosting} #{})
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
                [{:name "test", :type :info}])))))))

(deftest ^:parallel connection-props-server->client-schema-filters-test
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
             :description "Comma separated names of schemas that should appear in Metabase"
             :helper-text "You can use patterns like \"auth*\" to match multiple schemas"
             :type        "text"
             :visible-if  {:my-schema-filters-type "inclusion"}
             :required    true}
            {:name        "my-schema-filters-patterns"
             :placeholder "E.x. public,auth*"
             :description "Comma separated names of schemas that should NOT appear in Metabase"
             :helper-text "You can use patterns like \"auth*\" to match multiple schemas"
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
              {:name "last-prop"}])))))

(deftest ^:parallel connection-props-server->client-detect-cycles-test
  (testing "connection-props-server->client detects cycles in visible-if dependencies"
    (let [fake-props [{:name "prop-a", :visible-if {:prop-c "something"}}
                      {:name "prop-b", :visible-if {:prop-a "something else"}}
                      {:name "prop-c", :visible-if {:prop-b "something else entirely"}}]]
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Cycle detected"
            (driver.u/connection-props-server->client :fake-cyclic-driver fake-props))))))

(deftest ^:parallel connection-details-client->server-test
  (testing "db-details-client->server works as expected"
    (let [ks-val      "super duper secret keystore" ; not a real KeyStore "value" (which is a binary thing), but good
                                                    ; enough for our test purposes here
          db-details {:host                    "other-host"
                      :password-value          "super-secret-pw"
                      :use-keystore            true
                      :keystore-options        "uploaded"
                      ;; because treat-before-posting is base64 in the config for this property, simulate that happening
                      :keystore-value          (->> (.getBytes ks-val StandardCharsets/UTF_8)
                                                    (.encodeToString (Base64/getEncoder))
                                                    (str "data:application/octet-stream;base64,"))
                      :keystore-password-value "my-keystore-pw"}
          transformed (driver.u/db-details-client->server :secret-test-driver db-details)]
      ;; compare all fields except `:keystore-value` as a single map
      (is (= {:host                    "other-host"
              :password-value          "super-secret-pw"
              :keystore-password-value "my-keystore-pw"
              :use-keystore            true}
             (select-keys transformed [:host :password-value :keystore-password-value :use-keystore])))
      ;; the keystore-value should have been base64 decoded because of treat-before-posting being base64 (see above)
      (is (mt/secret-value-equals? ks-val (:keystore-value transformed))))))

(deftest ^:parallel decode-uploaded-test
  (are [expected base64] (= expected (String. (driver.u/decode-uploaded base64) "UTF-8"))
    "hi" "aGk="
    "hi" "data:application/octet-stream;base64,aGk="))

(deftest ^:parallel semantic-version-gte-test
  (testing "semantic-version-gte works as expected"
    (are [x y] (driver.u/semantic-version-gte x y)
      [5 0]   [4 0]
      [5 0 1] [4 0]
      [5 0]   [4 0 1]
      [5 0]   [4 1]
      [4 1]   [4 1]
      [4 1]   [4]
      [4]     [4]
      [4]     [4 0 0])
    (are [x y] (not (driver.u/semantic-version-gte x y))
      [3]     [4]
      [4]     [4 1]
      [4 0]   [4 0 1]
      [4 0 1] [4 1]
      [3 9]   [4 0]
      [3 1]   [4])))

(deftest ^:parallel mark-h2-superseded-test
  (testing "H2 should have :superseded-by set so it doesn't show up in the list of available drivers in the UI DB edit forms"
   (is (=? {:driver-name "H2", :superseded-by :deprecated}
           (:h2 (driver.u/available-drivers-info))))))

(deftest ^:parallel database-id->driver-use-qp-store-test
  (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                    {:database (assoc meta/database :id Integer/MAX_VALUE, :engine :wow)})
    (is (= :wow
           (driver.u/database->driver Integer/MAX_VALUE)))))

(deftest supports?-failure-test
  (let [fake-test-db (mt/db)]
    (testing "supports? returns false when `driver/database-supports?` throws an exception"
      (with-redefs [driver/database-supports? (fn [_ _ _] (throw (Exception. "test exception message")))]
        (let [db           (assoc fake-test-db :name (mt/random-name))
              log-messages (mt/with-log-messages-for-level [metabase.driver.util :error]
                             (is (false? (driver.u/supports? :test-driver :expressions db))))]
          (is (some (fn [[level ^Throwable exception message]]
                      (and (= level :error)
                           (= (.getMessage exception) "test exception message")
                           (= message (u/format-color 'red "Failed to check feature 'expressions' for database '%s'" (:name db)))))
                    log-messages)))))
    (binding [driver.u/*memoize-supports?* true]
      (testing "supports? returns false when `driver/database-supports?` takes longer than the timeout"
        (let [db (assoc fake-test-db :name (mt/random-name))]
          (with-redefs [driver.u/supports?-timeout-ms 100
                        driver/database-supports? (fn [_ _ _] (Thread/sleep 200) true)]
            (let [log-messages (mt/with-log-messages-for-level [metabase.driver.util :error]
                                 (is (false? (driver.u/supports? :test-driver :expressions db))))]
              (is (some (fn [[level ^Throwable exception message]]
                          (and (= level :error)
                               (= (.getMessage exception) "Timed out after 100.0 ms")
                               (= message (u/format-color 'red "Failed to check feature 'expressions' for database '%s'" (:name db)))))
                        log-messages))))
          (testing "we memoize the results for the same database, so we don't log the error again"
            (let [log-messages (mt/with-log-messages-for-level [metabase.driver.util :error]
                                 (is (false? (driver.u/supports? :test-driver :expressions db))))]
              (is (nil? log-messages)))))))))

(defmethod auth-provider/fetch-auth ::test-me
  [_provider _db-id details]
  (is (= "testing" (:key details)))
  {:password "qux"})

(deftest ^:parallel simple-test
  (let [details {:username "test"
                 :password "ignored"
                 :use-auth-provider true
                 :auth-provider ::test-me
                 :key "testing"}]
    (mt/with-temp [:model/Database db {:details details}]
      (is (=? (assoc details :password "qux")
              (driver.u/fetch-and-incorporate-auth-provider-details
               (:engine db)
               (:id db)
               (:details db)))))))

(deftest http-provider-tests
  (let [original-details (:details (mt/db))
        provider-details {:use-auth-provider true
                          :auth-provider "http"
                          :http-auth-url (client/build-url "/testing/echo"
                                                           {:body (json/encode original-details)})}]
    (is (= original-details (auth-provider/fetch-auth :http nil provider-details)))
    (is (= (merge provider-details original-details)
           (driver.u/fetch-and-incorporate-auth-provider-details
            (tx/driver)
            provider-details)))))

(deftest oauth-provider-tests
  (let [oauth-response {:access_token "foobar"
                        :expires_in "84791"}
        provider-details {:use-auth-provider true
                          :auth-provider :oauth
                          :oauth-token-url (client/build-url "/testing/echo"
                                                             {:body (json/encode oauth-response)})}]
    (is (= oauth-response (auth-provider/fetch-auth :oauth nil provider-details)))
    (is (=? (merge provider-details
                   {:password "foobar"
                    :password-expiry-timestamp #(and (int? %) (> % (System/currentTimeMillis)))})
            (driver.u/fetch-and-incorporate-auth-provider-details
             (tx/driver)
             provider-details)))))

(deftest ^:parallel azure-managed-identity-provider-tests
  (testing "password gets resolved"
    (let [client-id "client ID"
          provider-details {:use-auth-provider true
                            :auth-provider :azure-managed-identity
                            :azure-managed-identity-client-id client-id
                            :password "xyz"}
          response-body {:access_token "foobar"}]
      (binding [auth-provider/*fetch-as-json* (fn [url _headers]
                                                (is (str/includes? url client-id))
                                                response-body)]
        (is (= response-body (auth-provider/fetch-auth :azure-managed-identity nil provider-details)))
        (is (= (merge provider-details {:password "foobar"})
               (driver.u/fetch-and-incorporate-auth-provider-details
                (tx/driver)
                provider-details))))))
  (testing "existing password doesn't get overwritten if not using an auth provider"
    (let [client-id "client ID"
          provider-details {:use-auth-provider false
                            :auth-provider :azure-managed-identity
                            :azure-managed-identity-client-id client-id
                            :password "xyz"}]
      (binding [auth-provider/*fetch-as-json* (fn [_url _headers]
                                                (is false "should not get called"))]
        (is (= provider-details
               (driver.u/fetch-and-incorporate-auth-provider-details
                (tx/driver)
                provider-details)))))))
