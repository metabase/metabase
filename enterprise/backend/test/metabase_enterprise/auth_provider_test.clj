(ns metabase-enterprise.auth-provider-test
  (:require
    [clojure.test :refer [deftest is testing]]
    [metabase.auth-provider :as auth-provider]
    [metabase.db.data-source :as mdb.data-source]
    [metabase.test :as mt]
    [metabase.util.http :as u.http])
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
