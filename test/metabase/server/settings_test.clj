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
