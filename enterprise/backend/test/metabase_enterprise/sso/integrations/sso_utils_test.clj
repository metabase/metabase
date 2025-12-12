(ns metabase-enterprise.sso.integrations.sso-utils-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.test :as mt]))

(deftest check-sso-redirect-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "check-sso-redirect properly validates redirect URIs"
      (are [uri] (sso-utils/check-sso-redirect uri)
        "/"
        "/test"
        "localhost"
        "http://localhost:3000"
        "http://localhost:3000/dashboard/1-test-dashboard?currency=British%20Pound"))

    (testing "check-sso-redirect- throws an error for invalid redirect URIs"
      (are [uri] (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid redirect URL" (sso-utils/check-sso-redirect uri))
        "http://example.com"
        "//example.com"
        "not a url"
        "localhost:3000" ; URI thinks `localhost` here is scheme
        "http://localhost:3000?a=not a param"))))
