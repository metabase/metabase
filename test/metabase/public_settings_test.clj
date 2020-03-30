(ns metabase.public-settings-test
  (:require [clojure.test :refer :all]
            [environ.core :as env]
            [metabase.models.setting :as setting]
            [metabase.public-settings :as public-settings]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.i18n :refer [tru]]
            [puppetlabs.i18n.core :as i18n]))

(use-fixtures :once (fixtures/initialize :db))

;; double-check that setting the `site-url` setting will automatically strip off trailing slashes
(deftest site-url-settings
  (is (= "http://localhost:3000"
         (tu/with-temporary-setting-values [site-url nil]
           (public-settings/site-url "http://localhost:3000/")
           (public-settings/site-url)))))

;; double-check that setting the `site-url` setting will prepend `http://` if no protocol was specified
(deftest site-url-settings-prepend-http
  (is (= "http://localhost:3000"
         (tu/with-temporary-setting-values [site-url nil]
           (public-settings/site-url "localhost:3000")
           (public-settings/site-url)))))

(deftest site-url-settings-with-no-trailing-slash
  (is (= "http://localhost:3000"
         (tu/with-temporary-setting-values [site-url nil]
           (public-settings/site-url "http://localhost:3000")
           (public-settings/site-url)))))

;; if https:// was specified it should keep it
(deftest site-url-settings-https
  (is (= "https://localhost:3000"
         (tu/with-temporary-setting-values [site-url nil]
           (public-settings/site-url "https://localhost:3000")
           (public-settings/site-url)))))

;; we should not be allowed to set an invalid `site-url` (#9850)
(deftest site-url-settings-validate-site-url
  (is (thrown? AssertionError
               (tu/with-temporary-setting-values [site-url nil]
                 (public-settings/site-url "http://https://www.camsaul.com")))))

(deftest site-url-settings-set-valid-domain-name
  (is (tu/with-temporary-setting-values [site-url nil]
        (public-settings/site-url "https://www.camsaul.x"))))

;; if `site-url` in the database is invalid, the getter for `site-url` should return `nil` (#9849)
(deftest site-url-settings-nil-getter-when-invalid
  (is (= {:get-string "https://&", :site-url nil}
         (tu.log/suppress-output
          (tu/with-temporary-setting-values [site-url "https://metabase.com"]
            (setting/set-string! :site-url "https://&")
            {:get-string (setting/get-string :site-url)
             :site-url   (public-settings/site-url)})))))

;; We should normalize `site-url` when set via env var we should still normalize it (#9764)
(deftest site-url-settings-normalize
  (is (= {:get-string "localhost:3000/", :site-url "http://localhost:3000"}
         (with-redefs [env/env (assoc env/env :mb-site-url "localhost:3000/")]
           (tu/with-temporary-setting-values [site-url nil]
             {:get-string (setting/get-string :site-url)
              :site-url   (public-settings/site-url)})))))

(deftest invalid-site-url-env-var-test
  {:get-string "asd_12w31%$;", :site-url nil}
  (testing (str "If `site-url` is set via an env var, and it's invalid, we should return `nil` rather than having the"
                " whole instance break")
    (tu.log/suppress-output
     (with-redefs [env/env (assoc env/env :mb-site-url "asd_12w31%$;")]
       (tu/with-temporary-setting-values [site-url nil]
         (is (= "asd_12w31%$;"
                (setting/get-string :site-url)))
         (is (= nil
                (public-settings/site-url))))))))

(deftest translate-public-setting
  (is (= "HOST"
         (let [zz (i18n/string-as-locale "zz")]
           (i18n/with-user-locale zz
             (str (:display-name (first (get-in (setting/properties :public) [:engines :postgres :details-fields])))))))))

(deftest tru-translates
  (is (= [true "HOST"]
         (let [zz (i18n/string-as-locale "zz")]
           (i18n/with-user-locale zz
             [(= zz (i18n/user-locale))
              (tru "Host")])))))

;; Make sure Max Cache Entry Size can be set via with a string value, which is what comes back from the API (#9143)
(deftest max-cache-entry
  (is (= "1000"
         ;; use with temp value macro so original value gets reset after test run
         (tu/with-temporary-setting-values [query-caching-max-kb nil]
           (public-settings/query-caching-max-kb "1000")))))
