(ns metabase.server.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :as setting]
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

(deftest isolated-origin-is-an-origin-test
  (testing "MB_ISOLATED_ORIGIN reads back as a bare origin, the form the frontend and the
            redirect build on"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (doseq [[env expected] [["https://apps.example.com"            "https://apps.example.com"]
                              ["https://apps.example.com/"           "https://apps.example.com"]
                              ["  https://apps.example.com  "        "https://apps.example.com"]
                              ["https://Apps.Example.com/x/y?z=1#h"  "https://apps.example.com"]
                              ["https://apps.example.com:443"        "https://apps.example.com"]
                              ["https://apps.example.com:8443/"      "https://apps.example.com:8443"]
                              ["apps.example.com"                    "https://apps.example.com"]]]
        (testing (pr-str env)
          (mt/with-temp-env-var-value! [mb-isolated-origin env]
            (is (= expected (server.settings/isolated-origin))))))))
  (testing "a value without a scheme takes the site URL's scheme"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-temp-env-var-value! [mb-isolated-origin "apps.localhost:3000"]
        (is (= "http://apps.localhost:3000" (server.settings/isolated-origin))))))
  (testing "an unusable value turns data apps off rather than serving them without the isolated origin, and logs why
            once"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (doseq [env ["https://" "ftp://apps.example.com" "https://apps example.com"
                   "https://mb.example.com:8443" "https://MB.example.com" "http://apps.example.com"]]
        (testing (pr-str env)
          (mt/with-temp-env-var-value! [mb-isolated-origin env]
            (mt/with-log-messages-for-level [messages [metabase.server.settings :error]]
              (is (nil? (server.settings/isolated-origin)))
              (is (true? (server.settings/isolated-origin-misconfigured?)))
              (is (= 1 (count (messages)))))))))))

(deftest isolated-origin-needs-a-site-url-test
  (testing "without a site URL the value can't be used, and data apps are off"
    (mt/with-temporary-setting-values [site-url nil]
      (mt/with-temp-env-var-value! [mb-isolated-origin "http://localhost:3001"]
        (is (nil? (server.settings/isolated-origin)))
        (is (true? (server.settings/isolated-origin-misconfigured?)))))))

(deftest isolated-origin-misconfigured-is-public-test
  (testing "the frontend learns that the value can't be used, so it can say so instead of loading nothing"
    (mt/with-temporary-setting-values [site-url "https://mb.example.com"]
      (mt/with-temp-env-var-value! [mb-isolated-origin "https://mb.example.com:8443"]
        (is (true? (:isolated-origin-misconfigured? (setting/user-readable-values-map #{:public}))))))
    (mt/with-temp-env-var-value! [mb-isolated-origin nil]
      (is (false? (:isolated-origin-misconfigured? (setting/user-readable-values-map #{:public})))))))

(deftest isolated-origin-unset-is-not-misconfigured-test
  (mt/with-temp-env-var-value! [mb-isolated-origin nil]
    (is (nil? (server.settings/isolated-origin)))
    (is (false? (server.settings/isolated-origin-misconfigured?)))))

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
