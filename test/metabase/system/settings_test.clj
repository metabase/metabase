(ns metabase.system.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.models.setting :as setting]
   [metabase.system.settings :as system.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.i18n :as i18n :refer [tru]]))

(use-fixtures :once (fixtures/initialize :db))

(deftest site-url-settings
  (testing "double-check that setting the `site-url` setting will automatically strip off trailing slashes"
    (mt/discard-setting-changes [site-url]
      (system.settings/site-url! "http://localhost:3000/")
      (is (= "http://localhost:3000"
             (system.settings/site-url))))))

(deftest site-url-settings-prepend-http
  (testing "double-check that setting the `site-url` setting will prepend `http://` if no protocol was specified"
    (mt/discard-setting-changes [site-url]
      (system.settings/site-url! "localhost:3000")
      (is (= "http://localhost:3000"
             (system.settings/site-url))))))

(deftest site-url-settings-with-no-trailing-slash
  (mt/discard-setting-changes [site-url]
    (system.settings/site-url! "http://localhost:3000")
    (is (= "http://localhost:3000"
           (system.settings/site-url)))))

(deftest site-url-settings-https
  (testing "if https:// was specified it should keep it"
    (mt/discard-setting-changes [site-url]
      (system.settings/site-url! "https://localhost:3000")
      (is (= "https://localhost:3000"
             (system.settings/site-url))))))

(deftest site-url-settings-validate-site-url
  (testing "we should not be allowed to set an invalid `site-url` (#9850)"
    (mt/discard-setting-changes [site-url]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (system.settings/site-url! "http://https://www.camsaul.com"))))))

(deftest site-url-settings-set-valid-domain-name
  (mt/discard-setting-changes [site-url]
    (is (some? (system.settings/site-url! "https://www.camsaul.x")))))

(deftest site-url-settings-nil-getter-when-invalid
  (testing "if `site-url` in the database is invalid, the getter for `site-url` should return `nil` (#9849)"
    (mt/discard-setting-changes [site-url]
      (setting/set-value-of-type! :string :site-url "https://&")
      (is (= "https://&"
             (setting/get-value-of-type :string :site-url)))
      (is (= nil
             (system.settings/site-url))))))

(deftest site-url-settings-normalize
  (testing "We should normalize `site-url` when set via env var we should still normalize it (#9764)"
    (mt/with-temp-env-var-value! [mb-site-url "localhost:3000/"]
      (is (= "localhost:3000/"
             (setting/get-value-of-type :string :site-url)))
      (is (= "http://localhost:3000"
             (system.settings/site-url))))))

(deftest invalid-site-url-env-var-test
  (testing (str "If `site-url` is set via an env var, and it's invalid, we should return `nil` rather than having the"
                " whole instance break")
    (mt/with-temp-env-var-value! [mb-site-url "asd_12w31%$;"]
      (is (= "asd_12w31%$;"
             (setting/get-value-of-type :string :site-url)))
      (is (= nil
             (system.settings/site-url))))))

(deftest translate-public-setting
  (mt/with-mock-i18n-bundles! {"zz" {:messages {"Host" "HOST"}}}
    (mt/with-user-locale "zz"
      (is (= "HOST"
             (str (get-in (setting/user-readable-values-map #{:public})
                          [:engines :postgres :details-fields 0 :fields 0 :display-name])))))))

(deftest tru-translates
  (mt/with-mock-i18n-bundles! {"zz" {:messages {"Host" "HOST"}}}
    (mt/with-user-locale "zz"
      (is (= (i18n/locale "zz")
             (i18n/user-locale)))
      (is (= "HOST"
             (tru "Host"))))))

(deftest site-locale-validate-input-test
  (testing "site-locale should validate input"
    (testing "blank string"
      (mt/with-temporary-setting-values [site-locale "en_US"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid locale \"\""
             (system.settings/site-locale! "")))
        (is (= "en_US"
               (system.settings/site-locale)))))
    (testing "non-existant locale"
      (mt/with-temporary-setting-values [site-locale "en_US"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid locale \"en_EN\""
             (system.settings/site-locale! "en_EN")))
        (is (= "en_US"
               (system.settings/site-locale)))))))

(deftest site-locale-normalize-input-test
  (testing "site-locale should normalize input"
    (mt/discard-setting-changes [site-locale]
      (system.settings/site-locale! "en-us")
      (is (= "en_US"
             (system.settings/site-locale))))))

(deftest unset-site-locale-test
  (testing "should be able to unset site-locale"
    (mt/discard-setting-changes [site-locale]
      (system.settings/site-locale! "es")
      (system.settings/site-locale! nil)
      (is (= "en"
             (system.settings/site-locale))
          "should default to English"))))

(deftest site-locale-only-return-valid-locales-test
  (mt/with-temporary-raw-setting-values [site-locale "wow_this_in_not_a_locale"]
    (is (nil? (system.settings/site-locale)))))
