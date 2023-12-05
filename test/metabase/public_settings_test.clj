(ns ^:mb/once metabase.public-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.i18n :as i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest site-url-settings
  (testing "double-check that setting the `site-url` setting will automatically strip off trailing slashes"
    (mt/discard-setting-changes [site-url]
      (public-settings/site-url! "http://localhost:3000/")
      (is (= "http://localhost:3000"
             (public-settings/site-url))))))

(deftest site-url-settings-prepend-http
  (testing "double-check that setting the `site-url` setting will prepend `http://` if no protocol was specified"
    (mt/discard-setting-changes [site-url]
      (public-settings/site-url! "localhost:3000")
      (is (= "http://localhost:3000"
             (public-settings/site-url))))))

(deftest site-url-settings-with-no-trailing-slash
  (mt/discard-setting-changes [site-url]
    (public-settings/site-url! "http://localhost:3000")
    (is (= "http://localhost:3000"
           (public-settings/site-url)))))

(deftest site-url-settings-https
  (testing "if https:// was specified it should keep it"
    (mt/discard-setting-changes [site-url]
      (public-settings/site-url! "https://localhost:3000")
      (is (= "https://localhost:3000"
             (public-settings/site-url))))))

(deftest site-url-settings-validate-site-url
  (testing "we should not be allowed to set an invalid `site-url` (#9850)"
    (mt/discard-setting-changes [site-url]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (public-settings/site-url! "http://https://www.camsaul.com"))))))

(deftest site-url-settings-set-valid-domain-name
  (mt/discard-setting-changes [site-url]
    (is (some? (public-settings/site-url! "https://www.camsaul.x")))))

(deftest site-url-settings-nil-getter-when-invalid
  (testing "if `site-url` in the database is invalid, the getter for `site-url` should return `nil` (#9849)"
    (mt/discard-setting-changes [site-url]
      (setting/set-value-of-type! :string :site-url "https://&")
      (is (= "https://&"
             (setting/get-value-of-type :string :site-url)))
      (is (= nil
             (public-settings/site-url))))))

(deftest site-url-settings-normalize
  (testing "We should normalize `site-url` when set via env var we should still normalize it (#9764)"
    (mt/with-temp-env-var-value [mb-site-url "localhost:3000/"]
      (is (= "localhost:3000/"
             (setting/get-value-of-type :string :site-url)))
      (is (= "http://localhost:3000"
             (public-settings/site-url))))))

(deftest invalid-site-url-env-var-test
  (testing (str "If `site-url` is set via an env var, and it's invalid, we should return `nil` rather than having the"
                " whole instance break")
    (mt/with-temp-env-var-value [mb-site-url "asd_12w31%$;"]
      (is (= "asd_12w31%$;"
             (setting/get-value-of-type :string :site-url)))
      (is (= nil
             (public-settings/site-url))))))

(deftest site-url-should-update-https-redirect-test
  (testing "Changing `site-url` to non-HTTPS should disable forced HTTPS redirection"
    (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                       redirect-all-requests-to-https true]
      (is (= true
             (public-settings/redirect-all-requests-to-https)))
      (public-settings/site-url! "http://example.com")
      (is (= false
             (public-settings/redirect-all-requests-to-https)))))

  (testing "Changing `site-url` to non-HTTPS should disable forced HTTPS redirection"
    (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                       redirect-all-requests-to-https true]
      (is (= true
             (public-settings/redirect-all-requests-to-https)))
      (public-settings/site-url! "https://different.example.com")
      (is (= true
             (public-settings/redirect-all-requests-to-https))))))

(deftest translate-public-setting
  (mt/with-mock-i18n-bundles {"zz" {:messages {"Host" "HOST"}}}
    (mt/with-user-locale "zz"
      (is (= "HOST"
             (str (get-in (setting/user-readable-values-map #{:public})
                          [:engines :postgres :details-fields 0 :display-name])))))))

(deftest tru-translates
  (mt/with-mock-i18n-bundles {"zz" {:messages {"Host" "HOST"}}}
    (mt/with-user-locale "zz"
      (is (= true
             (= (i18n/locale "zz")
                (i18n/user-locale))))
      (is (= "HOST"
             (tru "Host"))))))

(deftest query-caching-max-kb-test
  (testing (str "Make sure Max Cache Entry Size can be set via with a string value, which is what comes back from the "
                "API (#9143)")
    (mt/discard-setting-changes [query-caching-max-kb]
      (is (= "1000"
             (public-settings/query-caching-max-kb! "1000")))))

  (testing "query-caching-max-kb should throw an error if you try to put in a huge value"
    (mt/discard-setting-changes [query-caching-max-kb]
      (is (thrown-with-msg?
           IllegalArgumentException
           #"Values greater than 204,800 \(200\.0 MB\) are not allowed"
           (public-settings/query-caching-max-kb! (* 1024 1024)))))))

(deftest site-locale-validate-input-test
  (testing "site-locale should validate input"
    (testing "blank string"
      (mt/with-temporary-setting-values [site-locale "en_US"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid locale \"\""
             (public-settings/site-locale! "")))
        (is (= "en_US"
               (public-settings/site-locale)))))
    (testing "non-existant locale"
      (mt/with-temporary-setting-values [site-locale "en_US"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid locale \"en_EN\""
             (public-settings/site-locale! "en_EN")))
        (is (= "en_US"
               (public-settings/site-locale)))))))

(deftest site-locale-normalize-input-test
  (testing "site-locale should normalize input"
    (mt/discard-setting-changes [site-locale]
      (public-settings/site-locale! "en-us")
      (is (= "en_US"
             (public-settings/site-locale))))))

(deftest unset-site-locale-test
  (testing "should be able to unset site-locale"
    (mt/discard-setting-changes [site-locale]
      (public-settings/site-locale! "es")
      (public-settings/site-locale! nil)
      (is (= "en"
             (public-settings/site-locale))
          "should default to English"))))

(deftest site-locale-only-return-valid-locales-test
  (mt/with-temporary-raw-setting-values [site-locale "wow_this_in_not_a_locale"]
    (is (nil? (public-settings/site-locale)))))

(deftest redirect-all-requests-to-https-test
  (testing "Shouldn't be allowed to set `redirect-all-requests-to-https` to `true` unless `site-url` is HTTPS"
    (doseq [v [true "true"]]
      (testing (format "\nSet value to ^%s %s" (.getCanonicalName (class v)) (pr-str v))
        (testing "\n`site-url` *is* HTTPS"
          (mt/with-temporary-setting-values [site-url                       "https://example.com"
                                             redirect-all-requests-to-https false]
            (public-settings/redirect-all-requests-to-https! v)
            (is (= true
                   (public-settings/redirect-all-requests-to-https)))))

        (testing "\n`site-url` is not HTTPS"
          (mt/with-temporary-setting-values [site-url                       "http://example.com"
                                             redirect-all-requests-to-https false]
            (is (thrown?
                 AssertionError
                 (public-settings/redirect-all-requests-to-https! v)))
            (is (= false
                   (public-settings/redirect-all-requests-to-https)))))))))


(deftest cloud-gateway-ips-test
  (mt/with-temp-env-var-value [mb-cloud-gateway-ips "1.2.3.4,5.6.7.8"]
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (testing "Setting returns ips given comma delimited ips."
        (is (= ["1.2.3.4" "5.6.7.8"]
               (public-settings/cloud-gateway-ips)))))

    (testing "Setting returns nil in self-hosted environments"
      (with-redefs [premium-features/is-hosted? (constantly false)]
        (is (= nil (public-settings/cloud-gateway-ips)))))))

(deftest start-of-week-test
  (mt/discard-setting-changes [start-of-week]
    (testing "Error on invalid value"
      (is (thrown-with-msg?
           Throwable
           #"Invalid day of week: :fraturday"
           (public-settings/start-of-week! :fraturday))))
    (mt/with-temp-env-var-value [start-of-week nil]
      (testing "Should default to Sunday"
        (is (= :sunday
               (public-settings/start-of-week))))
      (testing "Sanity check: make sure we're setting the env var value correctly for the assertion after this"
        (mt/with-temp-env-var-value [:mb-start-of-week "monday"]
          (is (= :monday
                 (public-settings/start-of-week)))))
      (testing "Fall back to default if value is invalid"
        (mt/with-temp-env-var-value [:mb-start-of-week "fraturday"]
          (is (= :sunday
                 (public-settings/start-of-week))))))))
