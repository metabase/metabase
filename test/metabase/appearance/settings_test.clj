(ns metabase.appearance.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.appearance.settings :as appearance.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest help-link-setting-test
  (mt/discard-setting-changes [help-link]
    (mt/with-premium-features #{:whitelabel}
      (testing "When whitelabeling is enabled, help-link setting can be set to any valid value"
        (appearance.settings/help-link! :metabase)
        (is (= :metabase (appearance.settings/help-link)))

        (appearance.settings/help-link! :hidden)
        (is (= :hidden (appearance.settings/help-link)))

        (appearance.settings/help-link! :custom)
        (is (= :custom (appearance.settings/help-link))))

      (testing "help-link cannot be set to an invalid value"
        (is (thrown-with-msg?
             Exception #"Invalid help link option"
             (appearance.settings/help-link! :invalid)))))

    (mt/with-premium-features #{}
      (testing "When whitelabeling is not enabled, help-link setting cannot be set, and always returns :metabase"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting help-link is not enabled because feature :whitelabel is not available"
             (appearance.settings/help-link! :hidden)))

        (is (= :metabase (appearance.settings/help-link)))))))

(deftest validate-help-url-test
  (testing "validate-help-url accepts valid URLs with HTTP or HTTPS protocols"
    (is (nil? (#'appearance.settings/validate-help-url "http://www.metabase.com")))
    (is (nil? (#'appearance.settings/validate-help-url "https://www.metabase.com"))))

  (testing "validate-help-url accepts valid mailto: links"
    (is (nil? (#'appearance.settings/validate-help-url "mailto:help@metabase.com"))))

  (testing "validate-help-url rejects malformed URLs and URLs with invalid protocols"
    ;; Since validate-help-url calls `u/url?` to validate URLs, we don't need to test all possible malformed URLs here.
    (is (thrown-with-msg?
         Exception
         #"Please make sure this is a valid URL"
         (#'appearance.settings/validate-help-url "asdf")))

    (is (thrown-with-msg?
         Exception
         #"Please make sure this is a valid URL"
         (#'appearance.settings/validate-help-url "ftp://metabase.com"))))

  (testing "validate-help-url rejects mailto: links with invalid email addresses"
    (is (thrown-with-msg?
         Exception
         #"Please make sure this is a valid URL"
         (#'appearance.settings/validate-help-url "mailto:help@metabase")))))

(deftest help-link-custom-destination-setting-test
  (mt/with-premium-features #{:whitelabel}
    (testing "When whitelabeling is enabled, help-link-custom-destination can be set to valid URLs"
      (appearance.settings/help-link-custom-destination! "http://www.metabase.com")
      (is (= "http://www.metabase.com" (appearance.settings/help-link-custom-destination)))

      (appearance.settings/help-link-custom-destination! "mailto:help@metabase.com")
      (is (= "mailto:help@metabase.com" (appearance.settings/help-link-custom-destination))))

    (testing "help-link-custom-destination cannot be set to invalid URLs"
      (is (thrown-with-msg?
           Exception
           #"Please make sure this is a valid URL"
           (appearance.settings/help-link-custom-destination! "asdf")))

      (is (thrown-with-msg?
           Exception
           #"Please make sure this is a valid URL"
           (appearance.settings/help-link-custom-destination! "ftp://metabase.com")))

      (is (thrown-with-msg?
           Exception
           #"Please make sure this is a valid URL"
           (appearance.settings/help-link-custom-destination! "mailto:help@metabase")))))

  (mt/with-premium-features #{}
    (testing "When whitelabeling is not enabled, help-link-custom-destination cannot be set, and always returns its default"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting help-link-custom-destination is not enabled because feature :whitelabel is not available"
           (appearance.settings/help-link-custom-destination! "http://www.metabase.com")))

      (is (= "https://www.metabase.com/help/premium" (appearance.settings/help-link-custom-destination))))))

(deftest landing-page-setting-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "should return relative url for valid inputs"
      (appearance.settings/landing-page! "")
      (is (= "" (appearance.settings/landing-page)))

      (appearance.settings/landing-page! "/")
      (is (= "/" (appearance.settings/landing-page)))

      (appearance.settings/landing-page! "/one/two/three/")
      (is (= "/one/two/three/" (appearance.settings/landing-page)))

      (appearance.settings/landing-page! "no-leading-slash")
      (is (= "/no-leading-slash" (appearance.settings/landing-page)))

      (appearance.settings/landing-page! "/pathname?query=param#hash")
      (is (= "/pathname?query=param#hash" (appearance.settings/landing-page)))

      (appearance.settings/landing-page! "#hash")
      (is (= "/#hash" (appearance.settings/landing-page)))

      (mt/with-temporary-setting-values [site-url "http://localhost"]
        (appearance.settings/landing-page! "http://localhost/absolute/same-origin")
        (is (= "/absolute/same-origin" (appearance.settings/landing-page)))))

    (testing "landing-page cannot be set to URLs with external origin"
      (is (thrown-with-msg?
           Exception
           #"This field must be a relative URL."
           (appearance.settings/landing-page! "https://google.com")))

      (is (thrown-with-msg?
           Exception
           #"This field must be a relative URL."
           (appearance.settings/landing-page! "sms://?&body=Hello")))

      (is (thrown-with-msg?
           Exception
           #"This field must be a relative URL."
           (appearance.settings/landing-page! "https://localhost/test")))

      (is (thrown-with-msg?
           Exception
           #"This field must be a relative URL."
           (appearance.settings/landing-page! "mailto:user@example.com")))

      (is (thrown-with-msg?
           Exception
           #"This field must be a relative URL."
           (appearance.settings/landing-page! "file:///path/to/resource"))))))

(deftest show-metabase-links-test
  (mt/discard-setting-changes [show-metabase-links]
    (mt/with-premium-features #{:whitelabel}
      (testing "When whitelabeling is enabled, show-metabase-links setting can be set to boolean"
        (appearance.settings/show-metabase-links! true)
        (is (true? (appearance.settings/show-metabase-links)))

        (appearance.settings/show-metabase-links! false)
        (is (= false (appearance.settings/show-metabase-links)))))

    (mt/with-premium-features #{}
      (testing "When whitelabeling is not enabled, show-metabase-links setting cannot be set, and always returns true"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting show-metabase-links is not enabled because feature :whitelabel is not available"
             (appearance.settings/show-metabase-links! true)))

        (is (true? (appearance.settings/show-metabase-links)))))))

(deftest loading-message-test
  (mt/with-premium-features #{:whitelabel}
    (testing "Loading message can be set by env var"
      (mt/with-temp-env-var-value! [mb-loading-message "running-query"]
        (is (= :running-query (appearance.settings/loading-message)))))

    (testing "Default value is returned if loading message set via env var to an unsupported keyword value"
      (mt/with-temp-env-var-value! [mb-loading-message "unsupported enum value"]
        (is (= :doing-science (appearance.settings/loading-message)))))

    (testing "Setter blocks unsupported values set at runtime"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Loading message set to an unsupported value"
                            (appearance.settings/loading-message! :unsupported-value))))))

(deftest custom-formatting-number-separators-test
  (testing "Only valid values can be set as number separators (#61854)"
    (let [violating-separators ".'"]
      (is (thrown-with-msg?
           Exception #"Invalid number separators."
           (appearance.settings/custom-formatting!
            #:type{:Temporal {:date_style "MMMM D, YYYY"
                              :time_style "h:mm A"
                              :date_abbreviate false}
                   :Number {:number_separators violating-separators}
                   :Currency {:currency "USD" :currency_style "symbol"}}))))))
