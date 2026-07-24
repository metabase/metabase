(ns metabase.server.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.settings :as server.settings]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest redirect-all-requests-to-https-test
  (testing "Shouldn't be allowed to set `redirect-all-requests-to-https` to `true` unless `site-url` is HTTPS"
    (doseq [v [true "true"]]
      (testing (format "\nSet value to ^%s %s" (.getCanonicalName (class v)) (pr-str v))
        (testing "\n`site-url` *is* HTTPS"
          (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                             redirect-all-requests-to-https false]
            (server.settings/redirect-all-requests-to-https! v)
            (is (true?
                 (server.settings/redirect-all-requests-to-https)))))
        (testing "\n`site-url` is not HTTPS"
          (mt/with-temporary-setting-values [site-url                       "http://example.com"
                                             redirect-all-requests-to-https false]
            (is (thrown?
                 AssertionError
                 (server.settings/redirect-all-requests-to-https! v)))
            (is (= false
                   (server.settings/redirect-all-requests-to-https)))))))))

(deftest site-url-should-update-https-redirect-test
  (testing "Changing `site-url` to non-HTTPS should disable forced HTTPS redirection"
    (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                       redirect-all-requests-to-https true]
      (is (true?
           (server.settings/redirect-all-requests-to-https)))
      (system/site-url! "http://example.com")
      (is (= false
             (server.settings/redirect-all-requests-to-https))))))

(deftest site-url-should-update-https-redirect-test-2
  (testing "Changing `site-url` to non-HTTPS should disable forced HTTPS redirection"
    (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                       redirect-all-requests-to-https true]
      (is (true?
           (server.settings/redirect-all-requests-to-https)))
      (system/site-url! "https://different.example.com")
      (is (true?
           (server.settings/redirect-all-requests-to-https))))))

(deftest allowed-ip-addresses-test
  (testing "valid IP patterns can be set"
    (mt/with-temporary-setting-values [allowed-ip-addresses nil]
      (server.settings/allowed-ip-addresses! "127.0.0.1,192.168.0.0/16,10.0.0.1-10.0.0.255")
      (is (= "127.0.0.1,192.168.0.0/16,10.0.0.1-10.0.0.255"
             (server.settings/allowed-ip-addresses)))))
  (testing "invalid IP patterns are rejected"
    (mt/with-temporary-setting-values [allowed-ip-addresses nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid IP address pattern"
           (server.settings/allowed-ip-addresses! "not-an-ip")))))
  (testing "allowlist can be cleared"
    (mt/with-temporary-setting-values [allowed-ip-addresses "127.0.0.1"]
      (server.settings/allowed-ip-addresses! nil)
      (is (nil? (server.settings/allowed-ip-addresses))))))
