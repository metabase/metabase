(ns metabase-enterprise.whitelabeling.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.whitelabeling.settings :as whitelabeling.settings]
   [metabase.public-settings.premium-features-test
    :as
    premium-features.test]))

(deftest help-link-setting-test
  (premium-features.test/with-premium-features #{:whitelabeling}
    (testing "When whitelabeling is enabled, help-link setting can be set to any valid value"
      (whitelabeling.settings/help-link! :metabase)
      (is (= :metabase (whitelabeling.settings/help-link)))

      (whitelabeling.settings/help-link! :hidden)
      (is (= :hidden (whitelabeling.settings/help-link)))

      (whitelabeling.settings/help-link! :custom)
      (is (= :custom (whitelabeling.settings/help-link))))

    (testing "help-link cannot be set to an invalid value"
      (is (thrown-with-msg?
           Exception #"Invalid help link option"
           (whitelabeling.settings/help-link! :invalid)))))

  (premium-features.test/with-premium-features #{}
    (testing "When whitelabeling is not enabled, help-link setting cannot be set, and always returns :metabase"
      (is (thrown-with-msg?
           Exception
           #"Setting help-link is not enabled because feature :whitelabeling is not available"
           (whitelabeling.settings/help-link! :hidden)))

      (is (= :metabase (whitelabeling.settings/help-link))))))

(deftest validate-help-url-test
  (testing "validate-help-url accepts valid URLs with HTTP or HTTPS protocols"
    (is (nil? (#'whitelabeling.settings/validate-help-url "http://www.metabase.com")))
    (is (nil? (#'whitelabeling.settings/validate-help-url "https://www.metabase.com"))))

  (testing "validate-help-url accepts valid mailto: links"
    (is (nil? (#'whitelabeling.settings/validate-help-url "mailto:help@metabase.com"))))

  (testing "validate-help-url rejects malformed URLs and URLs with invalid protocols"
    ;; Since validate-help-url calls `u/url?` to validate URLs, we don't need to test all possible malformed URLs here.
    (is (thrown-with-msg?
         Exception
         #"Invalid URL"
         (#'whitelabeling.settings/validate-help-url "asdf")))

    (is (thrown-with-msg?
         Exception
         #"Invalid URL"
         (#'whitelabeling.settings/validate-help-url "ftp://metabase.com"))))

  (testing "validate-help-url rejects mailto: links with invalid email addresses"
    (is (thrown-with-msg?
         Exception
         #"Invalid email address in mailto: link"
         (#'whitelabeling.settings/validate-help-url "mailto:help@metabase")))))

(deftest help-link-custom-destination-setting-test
  (premium-features.test/with-premium-features #{:whitelabeling}
    (testing "When whitelabeling is enabled, help-link-custom-destination can be set to valid URLs"
      (whitelabeling.settings/help-link-custom-destination! "http://www.metabase.com")
      (is (= "http://www.metabase.com" (whitelabeling.settings/help-link-custom-destination)))

      (whitelabeling.settings/help-link-custom-destination! "mailto:help@metabase.com")
      (is (= "mailto:help@metabase.com" (whitelabeling.settings/help-link-custom-destination))))

    (testing "help-link-custom-destination cannot be set to invalid URLs"
      (is (thrown-with-msg?
           Exception
           #"Invalid URL"
           (whitelabeling.settings/help-link-custom-destination! "asdf")))

      (is (thrown-with-msg?
           Exception
           #"Invalid URL"
           (whitelabeling.settings/help-link-custom-destination! "ftp://metabase.com")))

      (is (thrown-with-msg?
           Exception
           #"Invalid email address in mailto: link"
           (whitelabeling.settings/help-link-custom-destination! "mailto:help@metabase")))))

  (premium-features.test/with-premium-features #{}
    (testing "When whitelabeling is not enabled, help-link-custom-destination cannot be set, and always returns nil"
      (is (thrown-with-msg?
           Exception
           #"Setting help-link-custom-destination is not enabled because feature :whitelabeling is not available"
           (whitelabeling.settings/help-link-custom-destination! "http://www.metabase.com")))

      (is (nil? (whitelabeling.settings/help-link-custom-destination))))))
