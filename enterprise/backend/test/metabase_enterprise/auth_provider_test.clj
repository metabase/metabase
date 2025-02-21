(ns metabase-enterprise.auth-provider-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.auth-provider :as auth-provider]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.driver.util :as driver.u]
   [metabase.http-client :as client]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.http :as u.http]
   [metabase.util.json :as json])
  (:import
   [java.util Properties]))

(set! *warn-on-reflection* true)

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
