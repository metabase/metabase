(ns metabase.appearance.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.appearance.settings :as appearance.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util.jvm :as u.jvm]))

(use-fixtures :once (fixtures/initialize :db))

(defn- image-data-uri [content-type content]
  (str "data:" content-type ";base64," (u.jvm/encode-base64 content)))

(defn- do-with-raw-value! [setting-key value thunk]
  (tu/do-with-temporary-setting-value! setting-key value thunk :raw-setting? true))

(deftest custom-illustration-url-test
  (mt/with-premium-features #{:whitelabel}
    (doseq [setting-key appearance.settings/custom-illustration-settings]
      (testing setting-key
        (do-with-raw-value!
         setting-key (image-data-uri "image/png" "first")
         (fn []
           (let [url (setting/get setting-key)]
             (testing "an uploaded image is returned as a URL"
               (is (re-matches (re-pattern (str "api/session/illustration/" (name setting-key) "\\?v=[0-9a-f]{16}"))
                               url)))
             (testing "the stored value is still the data URI"
               (is (= (image-data-uri "image/png" "first")
                      (setting/get-value-of-type :string setting-key))))
             (testing "the same image gives the same URL"
               (is (= url (setting/get setting-key))))
             (testing "another image gives another URL"
               (do-with-raw-value! setting-key (image-data-uri "image/png" "second")
                                   #(is (not= url (setting/get setting-key))))))))))))

(deftest custom-illustration-other-values-test
  (mt/with-premium-features #{:whitelabel}
    (doseq [setting-key appearance.settings/custom-illustration-settings]
      (testing setting-key
        (testing "other values are returned unchanged"
          (doseq [value ["https://example.com/login.png"
                         (image-data-uri "text/plain" "not an image")
                         "data:image/png;base64,%%%"
                         "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"]]
            (do-with-raw-value! setting-key value #(is (= value (setting/get setting-key))))))
        (testing "no value"
          (do-with-raw-value! setting-key nil #(is (nil? (setting/get setting-key)))))))))

(deftest custom-illustration-feature-test
  (testing "without the whitelabel feature there is no value and no image"
    (mt/with-premium-features #{}
      (doseq [setting-key appearance.settings/custom-illustration-settings]
        (testing setting-key
          (do-with-raw-value! setting-key (image-data-uri "image/png" "first")
                              (fn []
                                (is (nil? (setting/get setting-key)))
                                (is (nil? (appearance.settings/illustration-image setting-key))))))))))

(deftest illustration-image-test
  (mt/with-premium-features #{:whitelabel}
    (testing "returns the decoded image of each setting"
      (mt/with-temporary-raw-setting-values [login-page-illustration-custom   (image-data-uri "IMAGE/PNG" "login")
                                             landing-page-illustration-custom (image-data-uri "image/png" "landing")
                                             no-data-illustration-custom      (image-data-uri "image/png" "no data")
                                             no-object-illustration-custom    (image-data-uri "image/png" "no object")]
        (doseq [[setting-key content] {:login-page-illustration-custom   "login"
                                       :landing-page-illustration-custom "landing"
                                       :no-data-illustration-custom      "no data"
                                       :no-object-illustration-custom    "no object"}]
          (testing setting-key
            (let [{:keys [content-type], image-bytes :bytes, image-hash :hash}
                  (appearance.settings/illustration-image setting-key)]
              (is (= "image/png" content-type))
              (is (= content (String. ^bytes image-bytes "UTF-8")))
              (is (= (str "api/session/illustration/" (name setting-key) "?v=" image-hash)
                     (setting/get setting-key))))))))))

(deftest illustration-image-media-type-test
  (mt/with-premium-features #{:whitelabel}
    (testing "media type parameters are kept"
      (mt/with-temporary-raw-setting-values [login-page-illustration-custom
                                             (image-data-uri "image/svg+xml;charset=iso-8859-1" "<svg/>")]
        (is (= {:content-type "image/svg+xml;charset=iso-8859-1", :media-type "image/svg+xml"}
               (select-keys (appearance.settings/illustration-image :login-page-illustration-custom)
                            [:content-type :media-type])))))
    (testing "a header with many parameters does not overflow the regex"
      (let [media-type (apply str "image/png" (for [i (range 5000)] (str ";p" i "=b")))]
        (mt/with-temporary-raw-setting-values [login-page-illustration-custom (image-data-uri media-type "first")]
          (is (= "image/png" (:media-type (appearance.settings/illustration-image :login-page-illustration-custom)))))))
    (testing "a header with invalid characters is returned unchanged"
      (let [value (str "data:image/png;x=a\r\nb;base64," (u.jvm/encode-base64 "first"))]
        (mt/with-temporary-raw-setting-values [login-page-illustration-custom value]
          (is (= value (appearance.settings/login-page-illustration-custom))))))))

(deftest illustration-image-nil-test
  (mt/with-premium-features #{:whitelabel}
    (testing "nil when the value is not an uploaded image"
      (mt/with-temporary-raw-setting-values [login-page-illustration-custom "https://example.com/login.png"]
        (is (nil? (appearance.settings/illustration-image :login-page-illustration-custom)))))
    (testing "nil for other settings"
      (mt/with-temporary-raw-setting-values [application-logo-url (image-data-uri "image/png" "logo")]
        (is (nil? (appearance.settings/illustration-image :application-logo-url)))))))

(deftest parsed-illustration-cache-reload-test
  (let [setting-key :login-page-illustration-custom
        raw         (image-data-uri "image/png" "first")
        reloaded    (String. ^String raw)
        cache       (atom {})]
    (with-redefs [appearance.settings/parsed-illustrations cache]
      (let [parsed (#'appearance.settings/parsed-illustration setting-key raw)]
        (is (some? parsed))
        (is (= raw reloaded))
        (is (not (identical? raw reloaded)))
        (is (identical? parsed
                        (#'appearance.settings/parsed-illustration setting-key reloaded)))
        (is (identical? reloaded (first (get @cache setting-key))))))))

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

(deftest application-font-validation-test
  (mt/discard-setting-changes [application-font]
    (mt/with-premium-features #{:whitelabel}
      (testing "application-font accepts a valid font"
        (appearance.settings/application-font! "Open Sans")
        (is (= "Open Sans" (appearance.settings/application-font))))
      (testing "application-font rejects an unknown font"
        (is (thrown-with-msg?
             Exception #"Invalid font"
             (appearance.settings/application-font! "Comic Sans")))))
    (mt/with-premium-features #{}
      (testing "application-font cannot be set when whitelabeling is not enabled"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting application-font is not enabled because feature :whitelabel is not available"
             (appearance.settings/application-font! "Open Sans")))))))

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
