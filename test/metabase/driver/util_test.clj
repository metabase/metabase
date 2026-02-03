(ns metabase.driver.util-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.util :as driver.u]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u])
  (:import
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

(deftest ^:parallel resolve-transitive-visible-if-test
  (testing "resolve-transitive-visible-if resolves transitive dependencies"
    (let [a {:name "prop-a"}, b {:name "prop-b" :visible-if {:prop-a true}}, c {:name "prop-c" :visible-if {:prop-b true}}, props-by-name {"prop-a" a, "prop-b" b, "prop-c" c}]
      (testing "property with no visible-if remains unchanged"
        (is (= a
               (#'driver.u/resolve-transitive-visible-if
                a
                props-by-name
                :test-driver))))

      (testing "property with single-level visible-if is preserved"
        (is (= b
               (#'driver.u/resolve-transitive-visible-if
                b
                props-by-name
                :test-driver))))

      (testing "property with transitive visible-if includes all dependencies"
        (is (= {:name "prop-c" :visible-if {:prop-b true
                                            :prop-a true}}
               (#'driver.u/resolve-transitive-visible-if
                c
                props-by-name
                :test-driver))))))

  (testing "empty visible-if is removed"
    (is (= {:name "prop-x"}
           (#'driver.u/resolve-transitive-visible-if
            {:name "prop-x" :visible-if {}}
            {}
            :test-driver))))

  (testing "dependencies on non-existent properties are kept (not filtered)"
    (let [props-by-name {"prop-a" {:name "prop-a"}}]
      (is (= {:name "prop-b" :visible-if {:non-existent-prop true}}
             (#'driver.u/resolve-transitive-visible-if
              {:name "prop-b" :visible-if {:non-existent-prop true}}
              props-by-name
              :test-driver)))))

  (testing "false dependencies (from removed :checked-section) are filtered out"
    (let [props-by-name {"prop-a" {:name "prop-a"}}]
      (is (= {:name "prop-b" :visible-if {:prop-a true}}
             (#'driver.u/resolve-transitive-visible-if
              {:name "prop-b" :visible-if {:prop-a true
                                           :removed-section false}}
              props-by-name
              :test-driver)))))

  (testing "multi-level transitive dependencies are fully resolved"
    (let [props-by-name {"prop-a" {:name "prop-a"}
                         "prop-b" {:name "prop-b" :visible-if {:prop-a true}}
                         "prop-c" {:name "prop-c" :visible-if {:prop-b true}}
                         "prop-d" {:name "prop-d" :visible-if {:prop-c true}}}]
      (is (= {:name "prop-d" :visible-if {:prop-c true
                                          :prop-b true
                                          :prop-a true}}
             (#'driver.u/resolve-transitive-visible-if
              {:name "prop-d" :visible-if {:prop-c true}}
              props-by-name
              :test-driver)))))

  (testing "cycle detection throws exception with appropriate error data"
    (let [props-by-name {"prop-a" {:name "prop-a" :visible-if {:prop-c true}}
                         "prop-b" {:name "prop-b" :visible-if {:prop-a true}}
                         "prop-c" {:name "prop-c" :visible-if {:prop-b true}}}]
      (try
        (#'driver.u/resolve-transitive-visible-if
         {:name "prop-a" :visible-if {:prop-c true}}
         props-by-name
         :test-driver)
        (is false "Should have thrown an exception")
        (catch clojure.lang.ExceptionInfo e
          (is (str/includes? (ex-message e) "Cycle detected"))
          (is (= :test-driver (:driver (ex-data e))))
          (is (= :driver (:type (ex-data e))))
          (is (set? (:cyclic-visible-ifs (ex-data e)))))))))

(deftest ^:parallel collect-all-props-by-name-test
  (testing "collect-all-props-by-name flattens nested groups"
    (testing "flat properties without groups"
      (let [props [{:name "prop-a"} {:name "prop-b"}]]
        (is (= {"prop-a" {:name "prop-a"}
                "prop-b" {:name "prop-b"}}
               (#'driver.u/collect-all-props-by-name props)))))

    (testing "single group with nested fields"
      (let [props [{:name "top-level"}
                   {:type :group
                    :container-style ["grid" "1fr 1fr"]
                    :fields [{:name "nested-1"}
                             {:name "nested-2"}]}]]
        (is (= {"top-level" {:name "top-level"}
                "nested-1" {:name "nested-1"}
                "nested-2" {:name "nested-2"}}
               (#'driver.u/collect-all-props-by-name props)))))

    (testing "deeply nested groups"
      (let [props [{:name "top"}
                   {:type :group
                    :fields [{:name "level-1"}
                             {:type :group
                              :fields [{:name "level-2"}
                                       {:name "level-2-b"}]}]}]]
        (is (= {"top" {:name "top"}
                "level-1" {:name "level-1"}
                "level-2" {:name "level-2"}
                "level-2-b" {:name "level-2-b"}}
               (#'driver.u/collect-all-props-by-name props)))))

    (testing "properties without names are skipped"
      (let [props [{:name "has-name"}
                   {:type :info :placeholder "no name"}]]
        (is (= {"has-name" {:name "has-name"}}
               (#'driver.u/collect-all-props-by-name props)))))))

(deftest ^:parallel resolve-transitive-visible-if-recursive-test
  (testing "resolve-transitive-visible-if-recursive handles groups"
    (testing "simple group structure is preserved"
      (let [props-by-name {"field-a" {:name "field-a"}}
            group {:type :group
                   :container-style ["grid" "1fr"]
                   :fields [{:name "nested-field"}]}]
        (is (= {:type :group
                :container-style ["grid" "1fr"]
                :fields [{:name "nested-field"}]}
               (#'driver.u/resolve-transitive-visible-if-recursive
                group
                props-by-name
                :test-driver)))))

    (testing "nested field with transitive dependency"
      (let [props-by-name {"field-a" {:name "field-a"}
                           "field-b" {:name "field-b" :visible-if {:field-a true}}
                           "nested" {:name "nested" :visible-if {:field-b true}}}
            group {:type :group
                   :fields [{:name "nested" :visible-if {:field-b true}}]}]
        (is (= {:type :group
                :fields [{:name "nested" :visible-if {:field-b true
                                                      :field-a true}}]}
               (#'driver.u/resolve-transitive-visible-if-recursive
                group
                props-by-name
                :test-driver)))))

    (testing "top-level field depending on nested field"
      (let [props-by-name {"nested-a" {:name "nested-a"}
                           "nested-b" {:name "nested-b" :visible-if {:nested-a true}}}
            prop {:name "top-level" :visible-if {:nested-b true}}]
        (is (= {:name "top-level" :visible-if {:nested-b true
                                               :nested-a true}}
               (#'driver.u/resolve-transitive-visible-if-recursive
                prop
                props-by-name
                :test-driver)))))))

(deftest ^:parallel connection-props-server->client-with-groups-test
  (testing "connection-props-server->client handles transitive dependencies across group boundaries"
    (testing "top-level field depends on nested field"
      (let [props [{:type :group
                    :fields [{:name "nested-field"}]}
                   {:name "top-field" :visible-if {:nested-field true}}]
            result (driver.u/connection-props-server->client :test-driver props)]
        (is (= 2 (count result)))
        (is (= :group (:type (first result))))
        (is (= {:name "top-field" :visible-if {:nested-field true}}
               (second result)))))

    (testing "nested field depends on top-level field with transitive chain"
      (let [props [{:name "field-a"}
                   {:name "field-b" :visible-if {:field-a true}}
                   {:type :group
                    :container-style ["grid" "1fr"]
                    :fields [{:name "nested" :visible-if {:field-b true}}]}]
            result (driver.u/connection-props-server->client :test-driver props)]
        (is (= 3 (count result)))
        ;; Check that the nested field has transitive dependencies resolved
        (let [group (nth result 2)
              nested-field (first (:fields group))]
          (is (= {:field-b true :field-a true}
                 (:visible-if nested-field))))))

    (testing "deeply nested groups with cross-boundary dependencies"
      (let [props [{:name "root-field"}
                   {:type :group
                    :fields [{:name "level-1" :visible-if {:root-field true}}
                             {:type :group
                              :fields [{:name "level-2" :visible-if {:level-1 true}}]}]}]
            result (driver.u/connection-props-server->client :test-driver props)
            outer-group (second result)
            inner-group (second (:fields outer-group))
            level-2-field (first (:fields inner-group))]
        (is (= {:level-1 true :root-field true}
               (:visible-if level-2-field)))))))

(deftest ^:parallel connection-props-server->client-detect-cycles-test
  (testing "connection-props-server->client detects cycles in visible-if dependencies"
    (let [fake-props [{:name "prop-a", :visible-if {:prop-c true}}
                      {:name "prop-b", :visible-if {:prop-a true}}
                      {:name "prop-c", :visible-if {:prop-b true}}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Cycle detected"
           (driver.u/connection-props-server->client :fake-cyclic-driver fake-props))))))

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
        (let [db      (assoc fake-test-db :name (mt/random-name))
              feature (keyword (name (ns-name *ns*)) (mt/random-name))]
          (mt/with-log-messages-for-level [log-messages [metabase.driver.util :error]]
            (is (false? (driver.u/supports? :test-driver feature db)))
            (is (some (fn [{:keys [level e message]}]
                        (and (= level :error)
                             (= (ex-message e) "test exception message")
                             (= message (u/format-color 'red "Failed to check feature '%s' for database '%s'"
                                                        (u/qualified-name feature)
                                                        (:name db)))))
                      (log-messages)))))))))

(deftest supports?-failure-test-2
  (let [fake-test-db (mt/db)]
    (binding [driver.u/*memoize-supports?* true]
      (testing "supports? returns false when `driver/database-supports?` takes longer than the timeout"
        (let [db      (assoc fake-test-db :name (mt/random-name))
              feature (keyword (name (ns-name *ns*)) (mt/random-name))]
          (with-redefs [driver.u/supports?-timeout-ms 100
                        driver/database-supports? (fn [_ _ _] (Thread/sleep 200) true)]
            (mt/with-log-messages-for-level [log-messages [metabase.driver.util :error]]
              (is (false? (driver.u/supports? :test-driver feature db)))
              (is (some (fn [{:keys [level e message]}]
                          (and (= level :error)
                               (= (ex-message e) "Timed out after 100.0 ms")
                               (= message (u/format-color 'red "Failed to check feature '%s' for database '%s'"
                                                          (u/qualified-name feature)
                                                          (:name db)))))
                        (log-messages)))))
          (testing "we memoize the results for the same database, so we don't log the error again"
            (mt/with-log-messages-for-level [log-messages [metabase.driver.util :error]]
              (is (false? (driver.u/supports? :test-driver feature db)))
              (is (= []
                     (log-messages))))))))))

(deftest sqlite-in-available-drivers
  (with-redefs [driver.impl/hierarchy (->  (derive (make-hierarchy) :sqlite :metabase.driver/driver)
                                           (derive :sqlite :metabase.driver.impl/concrete))]
    (testing "includes sqlite in non-hosted environment"
      (is (contains? (driver.u/available-drivers) :sqlite)))
    (mt/with-premium-features #{:hosting}
      (testing "does not include sqlite in hosted environment"
        (is (not (contains? (driver.u/available-drivers) :sqlite)))))))

(deftest ^:parallel process-connection-prop-test
  (testing "process-connection-prop handles different property types"
    (testing ":info type with getter function"
      (let [info-prop {:name "test-info"
                       :type :info
                       :getter (constantly "Test message")}
            result (#'driver.u/process-connection-prop info-prop)]
        (is (= 1 (count result)))
        (is (= "Test message" (:placeholder (first result))))
        (is (nil? (:getter (first result))) "Getter should be removed after processing")))

    (testing ":info type with nil getter returns empty vector"
      (let [info-prop {:name "test-info"
                       :type :info
                       :getter (constantly nil)}
            result (#'driver.u/process-connection-prop info-prop)]
        (is (= [] result) "Should return empty vector when getter returns nil")))

    (testing "regular property passes through unchanged"
      (let [regular-prop {:name "host"
                          :type :string
                          :display-name "Host"}
            result (#'driver.u/process-connection-prop regular-prop)]
        (is (= [regular-prop] result))))

    (testing ":group type with simple fields"
      (let [group-prop {:type :group
                        :container-style ["grid"]
                        :fields [{:name "field1" :type :string}
                                 {:name "field2" :type :integer}]}
            result (#'driver.u/process-connection-prop group-prop)]
        (is (= 1 (count result)))
        (is (= :group (:type (first result))))
        (is (= 2 (count (:fields (first result)))))))

    (testing ":group type flattens vectors in :fields array"
      (let [vector-of-props [{:name "tunnel-host" :type :string}
                             {:name "tunnel-port" :type :integer}]
            group-prop {:type :group
                        :container-style ["backdrop"]
                        :fields [{:name "ssl" :type :boolean}
                                 vector-of-props]}
            result (#'driver.u/process-connection-prop group-prop)]
        (is (= 1 (count result)))
        (let [processed-group (first result)
              fields (:fields processed-group)]
          (is (= 3 (count fields)) "Vector should be flattened into 3 separate fields")
          (is (= ["ssl" "tunnel-host" "tunnel-port"] (map :name fields))))))

    (testing ":group type recursively processes :info fields"
      (let [group-prop {:type :group
                        :fields [{:name "regular" :type :string}
                                 {:name "info-field"
                                  :type :info
                                  :getter (constantly "Info message")}]}
            result (#'driver.u/process-connection-prop group-prop)]
        (is (= 1 (count result)))
        (let [fields (:fields (first result))]
          (is (= 2 (count fields)))
          (is (= "Info message" (:placeholder (second fields))))
          (is (nil? (:getter (second fields))) "Getter should be removed"))))

    (testing ":group type handles nested groups"
      (let [nested-group {:type :group
                          :fields [{:name "inner1" :type :string}
                                   {:name "inner-info"
                                    :type :info
                                    :getter (constantly "Nested info")}]}
            outer-group {:type :group
                         :fields [{:name "outer" :type :string}
                                  nested-group]}
            result (#'driver.u/process-connection-prop outer-group)]
        (is (= 1 (count result)))
        (let [outer-fields (:fields (first result))
              inner-group (second outer-fields)
              inner-fields (:fields inner-group)]
          (is (= 2 (count outer-fields)))
          (is (= :group (:type inner-group)))
          (is (= 2 (count inner-fields)))
          (is (= "Nested info" (:placeholder (second inner-fields)))))))))

(deftest connection-props-server->client-processes-nested-groups-test
  (testing "connection-props-server->client processes groups with nested fields and vectors correctly"
    (let [mock-driver :test-driver
          props [{:name "regular" :type :string}
                 {:name "top-level-info"
                  :type :info
                  :getter (constantly "Top level message")}
                 {:type :group
                  :container-style ["backdrop"]
                  :fields [{:name "ssl" :type :boolean}
                           [{:name "tunnel-host" :type :string}
                            {:name "tunnel-port" :type :integer}]
                           {:name "group-info"
                            :type :info
                            :getter (constantly "Group info message")}]}]
          result (driver.u/connection-props-server->client mock-driver props)]

      (testing "top-level :info property is processed"
        (let [top-info (first (filter #(= "top-level-info" (:name %)) result))]
          (is (some? top-info))
          (is (= "Top level message" (:placeholder top-info)))))

      (testing "group contains flattened fields"
        (let [group (first (filter #(= :group (:type %)) result))
              fields (:fields group)]
          (is (= 4 (count fields)) "Should have 4 fields: ssl, tunnel-host, tunnel-port, group-info")
          (is (= ["ssl" "tunnel-host" "tunnel-port" "group-info"] (map :name fields)))))

      (testing ":info property inside group is processed"
        (let [group (first (filter #(= :group (:type %)) result))
              group-info (first (filter #(= "group-info" (:name %)) (:fields group)))]
          (is (some? group-info))
          (is (= "Group info message" (:placeholder group-info)))
          (is (nil? (:getter group-info)) "Getter should be removed"))))))
