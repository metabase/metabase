(ns metabase.public-settings-test
  (:require [clojure.test :refer :all]
            [environ.core :as env]
            [metabase
             [public-settings :as public-settings]
             [test :as mt]]
            [metabase.models.setting :as setting]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.i18n :as i18n :refer [tru]]))

(use-fixtures :once (fixtures/initialize :db))

(deftest site-url-settings
  (testing "double-check that setting the `site-url` setting will automatically strip off trailing slashes"
    (mt/discard-setting-changes [site-url]
      (public-settings/site-url "http://localhost:3000/")
      (is (= "http://localhost:3000"
             (public-settings/site-url))))))

(deftest site-url-settings-prepend-http
  (testing "double-check that setting the `site-url` setting will prepend `http://` if no protocol was specified"
    (mt/discard-setting-changes [site-url]
      (public-settings/site-url "localhost:3000")
      (is (= "http://localhost:3000"
             (public-settings/site-url))))))

(deftest site-url-settings-with-no-trailing-slash
  (mt/discard-setting-changes [site-url]
    (public-settings/site-url "http://localhost:3000")
    (is (= "http://localhost:3000"
           (public-settings/site-url)))))

(deftest site-url-settings-https
  (testing "if https:// was specified it should keep it")
  (mt/discard-setting-changes [site-url]
    (public-settings/site-url "https://localhost:3000")
    (is (= "https://localhost:3000"
           (public-settings/site-url)))))

(deftest site-url-settings-validate-site-url
  (testing "we should not be allowed to set an invalid `site-url` (#9850)"
    (mt/discard-setting-changes [site-url]
      (is (thrown?
           AssertionError
           (public-settings/site-url "http://https://www.camsaul.com"))))))

(deftest site-url-settings-set-valid-domain-name
  (mt/discard-setting-changes [site-url]
    (is (some? (public-settings/site-url "https://www.camsaul.x")))))

(deftest site-url-settings-nil-getter-when-invalid
  (testing "if `site-url` in the database is invalid, the getter for `site-url` should return `nil` (#9849)"
    (mt/discard-setting-changes [site-url]
      (setting/set-string! :site-url "https://&")
      (is (= "https://&"
             (setting/get-string :site-url)))
      (is (= nil
             (mt/suppress-output (public-settings/site-url)))))))

(deftest site-url-settings-normalize
  (testing "We should normalize `site-url` when set via env var we should still normalize it (#9764)"
    (with-redefs [env/env (assoc env/env :mb-site-url "localhost:3000/")]
      (mt/with-temporary-setting-values [site-url nil]
        (is (= "localhost:3000/"
               (setting/get-string :site-url)))
        (is (= "http://localhost:3000"
               (public-settings/site-url)))))))

(deftest invalid-site-url-env-var-test
  (testing (str "If `site-url` is set via an env var, and it's invalid, we should return `nil` rather than having the"
                " whole instance break")
    (mt/suppress-output
      (with-redefs [env/env (assoc env/env :mb-site-url "asd_12w31%$;")]
        (mt/with-temporary-setting-values [site-url nil]
          (is (= "asd_12w31%$;"
                 (setting/get-string :site-url)))
          (is (= nil
                 (public-settings/site-url))))))))

(deftest translate-public-setting
  (mt/with-mock-i18n-bundles {"zz" {"Host" "HOST"}}
    (mt/with-user-locale "zz"
      (is (= "HOST"
             (str (:display-name (first (get-in (setting/properties :public) [:engines :postgres :details-fields])))))))))

(deftest tru-translates
  (mt/with-mock-i18n-bundles {"zz" {"Host" "HOST"}}
    (mt/with-user-locale "zz"
      (is (= true
             (= (i18n/locale "zz")
                (i18n/user-locale))))
      (is (= "HOST"
             (tru "Host"))))))

(deftest max-cache-entry
  (testing "Make sure Max Cache Entry Size can be set via with a string value, which is what comes back from the API (#9143)"
    (mt/discard-setting-changes [query-caching-max-kb]
      (is (= "1000"
             (public-settings/query-caching-max-kb "1000"))))))
