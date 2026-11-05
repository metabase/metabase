(ns metabase.system.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.models.setting :as setting]
   [metabase.system.settings :as system.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]))

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

(setting/defsetting test-nested-i18n-setting
  "Public setting whose value nests a deferred-tru, the way driver connection properties do."
  :encryption :no
  :visibility :public
  :setter     :none
  :getter     (fn [] {:display-name (deferred-tru "Host")})
  :doc        false)

(deftest translate-public-setting
  (testing "a deferred-tru nested inside a public setting's value is realized in the user's locale"
    (mt/with-mock-i18n-bundles! {"zz" {:messages {"Host" "HOST"}}}
      (mt/with-user-locale "zz"
        (is (= "HOST"
               (str (get-in (setting/user-readable-values-map #{:public})
                            [:test-nested-i18n-setting :display-name]))))))))

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

(def ^:private allowlist-settings
  [[:readable-paths system.settings/readable-paths :mb-readable-paths]
   [:writable-paths system.settings/writable-paths :mb-writable-paths]])

(deftest allowed-paths-default-test
  (doseq [[setting-name getter env-var] allowlist-settings]
    (testing setting-name
      (tu/do-with-temp-env-var-value!
       env-var nil
       (fn []
         (testing "self-hosted, with nothing configured, every path is allowed"
           (mt/with-premium-features #{}
             (is (= ["/"] (getter)))))
         (testing "hosted, with nothing configured, only /tmp is allowed"
           (mt/with-premium-features #{:hosting}
             (is (= ["/tmp"] (getter))))))))))

(deftest allowed-paths-from-env-test
  (doseq [[setting-name getter env-var] allowlist-settings
          hosting                       [#{} #{:hosting}]]
    (testing (str setting-name " with features " hosting)
      (mt/with-premium-features hosting
        (testing "the environment wins over the default, even when hosted"
          (tu/do-with-temp-env-var-value! env-var "/a, /b/c ,,"
                                          #(is (= ["/a" "/b/c"] (getter)))))
        (testing "NONE allows no path"
          (tu/do-with-temp-env-var-value! env-var "NONE"
                                          #(is (= [] (getter)))))))))

(deftest allowed-paths-are-environment-only-test
  (testing "the allowlists are read from the environment only: a value that reached the setting table is ignored"
    (mt/with-premium-features #{:hosting}
      (mt/with-temp-env-var-value! [mb-readable-paths nil
                                    mb-writable-paths nil]
        (mt/with-temporary-raw-setting-values [readable-paths "/"
                                               writable-paths "/"]
          (is (= ["/tmp"] (system.settings/readable-paths)))
          (is (= ["/tmp"] (system.settings/writable-paths)))))))
  (testing "nothing can write them: they are read-only Settings"
    (is (thrown-with-msg? UnsupportedOperationException #"read-only setting"
                          (setting/set! :readable-paths "/")))
    (is (thrown-with-msg? UnsupportedOperationException #"read-only setting"
                          (setting/set! :writable-paths "/")))))
