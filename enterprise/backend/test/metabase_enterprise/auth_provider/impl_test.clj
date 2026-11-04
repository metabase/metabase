(ns metabase-enterprise.auth-provider.impl-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.auth-provider.core :as auth-provider]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.json :as json])
  (:import
   (java.net InetAddress)
   (java.util Properties)
   (org.apache.http.conn DnsResolver)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :web-server))

(deftest ^:parallel ensure-azure-managed-identity-password-test
  (mt/with-premium-features #{:database-auth-providers}
    (testing "nothing happens if ensure-azure-managed-identity-client-id is missing"
      (let [props (Properties.)]
        (is (empty? (#'mdb.data-source/ensure-azure-managed-identity-password props)))
        (is (empty? props))))
    (testing "password is set if it's missing"
      (let [now 0
            expiry-secs 1000
            expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
            props (doto (Properties.)
                    (.setProperty "azure-managed-identity-client-id" "client ID"))]
        (binding [u.http/*fetch-as-json* (fn [_url _headers]
                                           {:access_token "access token"
                                            :expires_in (str expiry-secs)})
                  mdb.data-source/*current-millis* (constantly now)]
          (is (= {"password" "access token"}
                 (#'mdb.data-source/ensure-azure-managed-identity-password props))))
        (is (= {"azure-managed-identity-client-id" "client ID"
                "password" "access token"
                "password-expiry-timestamp" expiry}
               props))))
    (testing "nothing happens if a fresh enough password is present"
      (let [now 0
            expiry-secs 1000
            expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
            props (doto (Properties.)
                    (.putAll {"azure-managed-identity-client-id" "client ID"
                              "password" "access token"
                              "password-expiry-timestamp" expiry}))]
        (binding [u.http/*fetch-as-json* (fn [_url _headers]
                                           (is false "should not get called"))
                  mdb.data-source/*current-millis* (constantly now)]
          (is (= {"password" "access token"}
                 (#'mdb.data-source/ensure-azure-managed-identity-password props))))
        (is (= {"azure-managed-identity-client-id" "client ID"
                "password" "access token"
                "password-expiry-timestamp" expiry}
               props))))
    (testing "a new password is set if the old one is stale"
      (let [now 0
            expiry-secs 1000
            expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
            props (doto (Properties.)
                    (.putAll {"azure-managed-identity-client-id" "client ID"
                              "password" "access token"
                              "password-expiry-timestamp" 0}))]
        (binding [u.http/*fetch-as-json* (fn [_url _headers]
                                           {:access_token "new access token"
                                            :expires_in (str expiry-secs)})
                  mdb.data-source/*current-millis* (constantly now)]
          (is (= {"password" "new access token"}
                 (#'mdb.data-source/ensure-azure-managed-identity-password props))))
        (is (= {"azure-managed-identity-client-id" "client ID"
                "password" "new access token"
                "password-expiry-timestamp" expiry}
               props))))))

(deftest cloud-auth-provider-network-policy-test
  (mt/with-premium-features #{:database-auth-providers}
    (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly true)
                                http/get (fn [_url _opts] (throw (AssertionError. "Unexpected request")))]
      (doseq [[provider details] [[:http {:http-auth-url "http://127.0.0.1"}]
                                  [:oauth {:oauth-token-url "http://10.0.0.1/token"}]
                                  [:azure-managed-identity {:azure-managed-identity-client-id "client"}]]]
        (is (thrown? clojure.lang.ExceptionInfo (auth-provider/fetch-auth provider nil details)))))))

(deftest cloud-auth-provider-request-options-test
  (mt/with-premium-features #{:database-auth-providers}
    (mt/with-dynamic-fn-redefs
      [premium-features/is-hosted? (constantly true)
       http/get (fn [_url opts]
                  (is (= {"Authorization" "Bearer test"} (:headers opts)))
                  (is (= :none (:redirect-strategy opts)))
                  (is (thrown? clojure.lang.ExceptionInfo
                               (.resolve ^org.apache.http.conn.DnsResolver (:dns-resolver opts) "localhost")))
                  {:body {:password "response"}})]
      (is (= {:password "response"}
             (auth-provider/fetch-auth :http nil {:http-auth-url "https://8.8.8.8"
                                                  :http-auth-headers "{\"Authorization\":\"Bearer test\"}"}))))))

(deftest cloud-auth-provider-dns-rebinding-test
  (mt/with-premium-features #{:database-auth-providers}
    (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly true)]
      (binding [u.http/*system-dns-resolver*
                (reify DnsResolver
                  (resolve [_ _host]
                    (into-array InetAddress [(InetAddress/getByName "127.0.0.1")])))]
        (let [error (try
                      (auth-provider/fetch-auth :http nil {:http-auth-url "http://rebinding.invalid"})
                      (catch Exception e e))]
          (is (:ssrf (u/all-ex-data error)) "the resolver rejects the address actually used to connect"))))))

(deftest http-provider-tests
  (mt/with-premium-features #{:database-auth-providers}
    (let [original-details (:details (mt/db))
          provider-details {:use-auth-provider true
                            :auth-provider "http"
                            :http-auth-url (client/build-url "/testing/echo"
                                                             {:body (json/encode original-details)})}]
      (is (= original-details (auth-provider/fetch-auth :http nil provider-details)))
      (is (= (merge provider-details original-details)
             (driver.u/fetch-and-incorporate-auth-provider-details
              (tx/driver)
              provider-details))))))

(deftest oauth-provider-tests
  (mt/with-premium-features #{:database-auth-providers}
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
               provider-details))))))

(deftest ^:parallel azure-managed-identity-provider-tests
  (mt/with-premium-features #{:database-auth-providers}
    (testing "password gets resolved"
      (let [client-id "client ID"
            provider-details {:use-auth-provider true
                              :auth-provider :azure-managed-identity
                              :azure-managed-identity-client-id client-id
                              :password "xyz"}
            response-body {:access_token "foobar"}]
        (binding [u.http/*fetch-as-json* (fn [url _headers]
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
        (binding [u.http/*fetch-as-json* (fn [_url _headers]
                                           (is false "should not get called"))]
          (is (= provider-details
                 (driver.u/fetch-and-incorporate-auth-provider-details
                  (tx/driver)
                  provider-details))))))))
