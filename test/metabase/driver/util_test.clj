(ns metabase.driver.util-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.settings :as driver.settings]
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

(deftest ^:parallel connection-props-server->client-detect-cycles-test
  (testing "connection-props-server->client detects cycles in visible-if dependencies"
    (let [fake-props [{:name "prop-a", :visible-if {:prop-c "something"}}
                      {:name "prop-b", :visible-if {:prop-a "something else"}}
                      {:name "prop-c", :visible-if {:prop-b "something else entirely"}}]]
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

(deftest features-batched-matches-per-feature-test
  (testing "bounding the whole scan instead of each check does not change which features come back"
    (let [db (driver.u/ensure-lib-database (mt/db))]
      (is (= (#'driver.u/features* :h2 db)
             (#'driver.u/features-batched* :h2 db))))))

(deftest features-batched-falls-back-when-budget-blown-test
  (testing "a blown batch budget falls back to the per-feature path instead of throwing or truncating"
    (let [db (driver.u/ensure-lib-database (mt/db))]
      (with-redefs [driver.u/supports?-timeout-ms 20
                    driver/database-supports? (fn [_ _ _] (Thread/sleep 50) true)]
        ;; every per-feature check times out too and degrades to false, which is exactly what the unbatched
        ;; path returns under the same stall
        (is (= (#'driver.u/features* :h2 db)
               (#'driver.u/features-batched* :h2 db)))))))

(deftest sqlite-in-available-drivers
  (with-redefs [driver.impl/hierarchy (->  (derive (make-hierarchy) :sqlite :metabase.driver/driver)
                                           (derive :sqlite :metabase.driver.impl/concrete))]
    (testing "includes sqlite in non-hosted environment"
      (is (contains? (driver.u/available-drivers) :sqlite)))
    (mt/with-premium-features #{:hosting}
      (testing "does not include sqlite in hosted environment"
        (is (not (contains? (driver.u/available-drivers) :sqlite)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            SSRF: blocking connections to private network addresses                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel connection-hosts-test
  (testing "the default implementation picks the host out of the usual detail keys"
    (are [details expected] (= expected (set (driver/connection-hosts :sql details)))
      {}                                              #{}
      {:host "db.example.com"}                        #{"db.example.com"}
      {:host "  db.example.com  "}                    #{"db.example.com"}
      {:host ""}                                      #{}
      {:host nil}                                     #{}
      {:hostname "athena.example.com"}                #{"athena.example.com"}
      {:host "a.example.com" :hostname "b.example.com"} #{"a.example.com" "b.example.com"}))
  (testing "hosts given as URLs or host:port pairs are normalized (BigQuery, Databricks and Druid all accept these)"
    (are [details expected] (= expected (set (driver/connection-hosts :sql details)))
      {:host "https://db.example.com:8443"}           #{"db.example.com"}
      {:host "http://10.0.0.1"}                       #{"10.0.0.1"}
      {:host "db.example.com:5432"}                   #{"db.example.com"}
      {:host "[::1]:5432"}                            #{"::1"}
      {:host "::1"}                                   #{"::1"}
      {:host "https://user:pw@10.0.0.1:8443/path"}    #{"10.0.0.1"}))
  (testing "comma-separated host lists are split (Mongo accepts a replica-set list here)"
    (is (= #{"a.example.com" "b.example.com"}
           (set (driver/connection-hosts :sql {:host "a.example.com,b.example.com"}))))))

(defn- ssrf-error [thunk]
  (try (thunk) nil (catch clojure.lang.ExceptionInfo e (ex-data e))))

(deftest validate-connection-hosts!-hosted-test
  (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
    (testing "connections to non-public addresses are refused"
      (doseq [details [{:host "127.0.0.1" :port 5432}
                       {:host "localhost" :port 5432}
                       {:host "10.224.7.141" :port 5432}
                       {:host "169.254.169.254"}
                       {:host "https://192.168.0.1:8443"}]]
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts! :postgres details)))
            (str "should be refused: " (pr-str details)))))
    (testing "the error is the same for every blocked host, so it cannot be used as a reachability oracle"
      (is (= (:message (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"})))
             (:message (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "10.224.7.141"}))))))
    (testing "public and unresolvable hosts are left alone"
      (doseq [details [{:host "8.8.8.8"}
                       {:host "metabase-ssrf-test.invalid"}]]
        (is (nil? (driver.u/validate-connection-hosts! :postgres details))
            (str "should be allowed: " (pr-str details)))))
    (testing "a database with no host of its own is refused: the client fills one in and connects anyway"
      ;; every `:sql-jdbc` client substitutes `localhost` for a host detail that is missing or blank, so reading only
      ;; the details would leave every port on the Metabase host reachable -- and an open one distinguishable from a
      ;; closed one -- to anybody who can add a database
      (doseq [details [{}
                       {:port 6379 :dbname "db"}
                       {:host "" :port 6379 :dbname "db"}
                       {:host "   " :port 6379 :dbname "db"}
                       {:db "/tmp/whatever.db"}]]
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts! :postgres details)))
            (str "should be refused: " (pr-str details)))))
    (testing "a driver whose database really is a file, rather than a client with a default host, still has no host"
      ;; master checks :sqlite here, but on this branch sqlite is still a driver module and not on the classpath of
      ;; every backend test job; :h2 is the file-backed driver that ships in core here.
      (is (nil? (driver.u/validate-connection-hosts! :h2 {:db "/tmp/whatever.db"}))))
    (testing "auth-provider URLs are fetched by Metabase itself, so they are checked too"
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts!
                            :postgres
                            {:host "db.example.com" :use-auth-provider true :auth-provider "oauth"
                             :oauth-token-url "http://169.254.169.254/latest/meta-data/"}))))
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts!
                            :postgres
                            {:host "db.example.com" :use-auth-provider true :auth-provider "http"
                             :http-auth-url "http://127.0.0.1:8080/token"}))))
      (testing "...but a public auth URL is fine, and the keys are ignored when the provider is off"
        (is (nil? (driver.u/validate-connection-hosts!
                   :postgres
                   {:host            "db.example.com" :use-auth-provider true
                    :oauth-token-url "https://login.example.com/token"})))
        (is (nil? (driver.u/validate-connection-hosts!
                   :postgres
                   {:host "db.example.com" :oauth-token-url "http://127.0.0.1:8080/token"})))))
    (testing "with an SSH tunnel the warehouse host is resolved by the tunnel server, so only the tunnel host matters"
      (is (nil? (driver.u/validate-connection-hosts!
                 :postgres
                 {:tunnel-enabled true :tunnel-host "bastion.example.com" :host "127.0.0.1" :port 5432})))
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts!
                            :postgres
                            {:tunnel-enabled true :tunnel-host "127.0.0.1" :host "db.example.com"})))))))

(deftest can-connect-with-details?-refused-host-test
  (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
    (let [details {:host "127.0.0.1" :port 5432 :dbname "db"}]
      (testing "the boolean arity keeps its contract and answers `false` rather than throwing"
        ;; sync, the unhidden-table resync task, and the legacy-details migration loop all branch on this answer;
        ;; a throw from here abandons work that used to carry on to the next database or the next candidate details
        (is (false? (driver.u/can-connect-with-details? :postgres details))))
      (testing "the throwing arity reports the refusal, unhumanized"
        ;; a driver's `humanize-connection-error-message` must not get to rewrite this into something more revealing
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"^Cannot connect to a private or internal network address\.$"
                              (driver.u/can-connect-with-details? :postgres details :throw-exceptions)))))))

(deftest validate-connection-hosts!-connection-parameters-test
  ;; A JDBC client honors a host named in the connection parameters over the one in the URL it was handed -- pgjdbc
  ;; reads `host=`/`PGHOST=` from the query string -- and `:additional-options` is appended to that string verbatim.
  (testing "a host smuggled through `:additional-options` is checked, not just the `:host` detail"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
      (doseq [opts ["host=169.254.169.254"
                    "PGHOST=127.0.0.1&ssl=false"
                    "ssl=false&host=[::1]"]]
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts!
                              :postgres {:host "db.example.com" :port 5432 :dbname "db"
                                         :additional-options opts})))
            (str "should be refused: " (pr-str opts))))
      (testing "an SSH tunnel does not exempt them -- it rewrites the host detail, not the parameters"
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts!
                              :postgres {:host "db.example.com" :port 5432 :dbname "db"
                                         :tunnel-enabled true :tunnel-host "bastion.example.com"
                                         :additional-options "host=169.254.169.254"})))))
      (testing "ordinary options are not mistaken for hosts"
        ;; only the parameters a driver declares in `driver/host-carrying-parameters` are resolved, so a value
        ;; that is not a host is never handed to the resolver -- and a name that happens to resolve inside the
        ;; cluster cannot refuse a database over its application name
        (is (nil? (driver.u/validate-connection-hosts!
                   :postgres {:host "db.example.com" :port 5432 :dbname "db"
                              :additional-options "loginTimeout=1&ApplicationName=localhost&ssl=false"}))))
      (testing "an undeclared parameter is still checked when its value is already an address"
        ;; a declaration that has fallen behind the client it describes is not a free pass; an IP costs no lookup
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts!
                              :postgres {:host "db.example.com" :port 5432 :dbname "db"
                                         :additional-options "ApplicationName=169.254.169.254"}))))))))

(driver/register! ::no-tunnel-driver, :abstract? true)

(deftest validate-connection-hosts!-tunnel-details-do-not-disable-the-check-test
  (testing "a driver that ignores the tunnel details still has its own hosts checked"
    ;; `:tunnel-enabled` is only meaningful to drivers that route the connection through the tunnel. Details are
    ;; stored as an open map, so any driver's details can carry the key -- for one that ignores it (BigQuery), taking
    ;; the caller's word for it would leave the host it really connects to unchecked.
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts!
                            ::no-tunnel-driver
                            {:tunnel-enabled true :tunnel-host "bastion.example.com" :host "169.254.169.254"}))))
      (testing "and the tunnel host it never contacts is not held against it"
        (is (nil? (driver.u/validate-connection-hosts!
                   ::no-tunnel-driver
                   {:tunnel-enabled true :tunnel-host "127.0.0.1" :host "db.example.com"}))))))
  (testing "drivers that do route through the tunnel are unaffected"
    (is (true? (driver/routes-connection-through-ssh-tunnel? :postgres)))
    (is (false? (driver/routes-connection-through-ssh-tunnel? ::no-tunnel-driver)))))

(driver/register! ::broken-hosts-driver, :abstract? true)

(defmethod driver/connection-hosts ::broken-hosts-driver
  [_driver _details]
  (throw (ex-info "boom" {:sensitive "should not reach the caller"})))

(deftest validate-connection-hosts!-fails-closed-test
  (testing "a driver that cannot say which hosts it would connect to is refused, not left unchecked"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts! ::broken-hosts-driver {:host "8.8.8.8"}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"could not apply security policy"
                            (driver.u/validate-connection-hosts! ::broken-hosts-driver {:host "8.8.8.8"})))
      (testing "the underlying failure is chained for the logs but kept out of the message"
        (let [e (try (driver.u/validate-connection-hosts! ::broken-hosts-driver {:host "8.8.8.8"})
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (= "boom" (ex-message (ex-cause e))))
          (is (not (str/includes? (ex-message e) "boom")))))
      (testing "details the driver multimethod itself refuses to dispatch on fail closed the same way"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"could not apply security policy"
                              (driver.u/validate-connection-hosts!
                               :postgres
                               {:host "8.8.8.8" :connection-uri "jdbc:postgresql://127.0.0.1:5432/db"}))))))
  (testing "with the policy off no hosts are extracted at all, so a broken driver is not an error"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-all"]
      (is (nil? (driver.u/validate-connection-hosts! ::broken-hosts-driver {:host "8.8.8.8"}))))))

(deftest validate-connection-hosts!-allowed-test
  (testing "allow-private permits private networks but still rejects loopback and link-local addresses"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-private"]
      (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "10.224.7.141"})))
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "169.254.169.254"}))))))
  (testing "allow-all permits every network -- the normal self-hosted case"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-all"]
      (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1" :port 5432})))
      (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "10.224.7.141"}))))))

(deftest warehouse-allowed-networks-default-test
  (testing "self-hosted, with nothing configured, all networks are allowed"
    ;; a self-hosted warehouse on a private network is the normal case, not an attack
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks nil]
      (mt/with-premium-features #{}
        (is (= :allow-all (driver.settings/warehouse-allowed-networks)))
        (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))))
  (testing "hosted, with nothing configured, only public addresses are allowed"
    ;; on Metabase Cloud a warehouse is always reached across the public internet, so anything else is somebody
    ;; reaching for our own infrastructure
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks nil]
      (mt/with-premium-features #{:hosting}
        (is (= :external-only (driver.settings/warehouse-allowed-networks)))
        (is (=? {:status-code 400}
                (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))
        (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "8.8.8.8"}))))))
  (testing "an explicit setting is honored on Cloud too, in either direction"
    (mt/with-premium-features #{:hosting}
      (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-all"]
        (is (= :allow-all (driver.settings/warehouse-allowed-networks)))
        (is (nil? (driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))
      (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-private"]
        (is (= :allow-private (driver.settings/warehouse-allowed-networks))))))
  (testing "an explicit setting overrides the default"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "external-only"]
      (is (= :external-only (driver.settings/warehouse-allowed-networks)))
      (is (=? {:status-code 400}
              (ssrf-error #(driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))))
  (testing "an unrecognized policy fails closed at the point of use rather than quietly allowing everything"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "unknown-policy"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Unknown network policy"
                            (driver.u/validate-connection-hosts! :postgres {:host "127.0.0.1"}))))))
