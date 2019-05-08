(ns metabase.public-settings-test
  (:require [environ.core :as env]
            [expectations :refer [expect]]
            [metabase.models.setting :as setting]
            [metabase.public-settings :as public-settings]
            [metabase.test.util :as tu]
            [metabase.test.util.log :as tu.log]
            [puppetlabs.i18n.core :as i18n :refer [tru]]))

 ;; double-check that setting the `site-url` setting will automatically strip off trailing slashes
(expect
  "http://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "http://localhost:3000/")
    (public-settings/site-url)))

 ;; double-check that setting the `site-url` setting will prepend `http://` if no protocol was specified
(expect
  "http://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "localhost:3000")
    (public-settings/site-url)))

(expect
  "http://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "localhost:3000")
    (public-settings/site-url)))

(expect
  "http://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "http://localhost:3000")
    (public-settings/site-url)))

;; if https:// was specified it should keep it
(expect
  "https://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "https://localhost:3000")
    (public-settings/site-url)))

;; we should not be allowed to set an invalid `site-url` (#9850)
(expect
  AssertionError
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "http://https://www.camsaul.com")))

(expect
  AssertionError
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "https://www.camsaul.x")))

;; if `site-url` in the database is invalid, the getter for `site-url` should return `nil` (#9849)
(expect
  {:get-string "https://www.camsaul.x", :site-url nil}
  (tu.log/suppress-output
    (tu/with-temporary-setting-values [site-url "https://metabase.com"]
      (setting/set-string! :site-url "https://www.camsaul.x")
      {:get-string (setting/get-string :site-url)
       :site-url   (public-settings/site-url)})))

;; We should normalize `site-url` when set via env var we should still normalize it (#9764)
(expect
  {:get-string "localhost:3000/", :site-url "http://localhost:3000"}
  (with-redefs [env/env (assoc env/env :mb-site-url "localhost:3000/")]
    (tu/with-temporary-setting-values [site-url nil]
      {:get-string (setting/get-string :site-url)
       :site-url   (public-settings/site-url)})))

;; if `site-url` is set via an env var, and it's invalid, we should return `nil` rather than having the whole instance break
(expect
  {:get-string "asd_12w31%$;", :site-url nil}
  (tu.log/suppress-output
    (with-redefs [env/env (assoc env/env :mb-site-url "asd_12w31%$;")]
      (tu/with-temporary-setting-values [site-url nil]
        {:get-string (setting/get-string :site-url)
         :site-url   (public-settings/site-url)}))))

(expect
  "HOST"
  (let [zz (i18n/string-as-locale "zz")]
    (i18n/with-user-locale zz
      (str (:display-name (first (get-in (public-settings/public-settings) [:engines :postgres :details-fields])))))))

(expect
  [true "HOST"]
  (let [zz (i18n/string-as-locale "zz")]
    (i18n/with-user-locale zz
      [(= zz (i18n/user-locale))
       (tru "Host")])))

;; Make sure Max Cache Entry Size can be set via with a string value, which is what comes back from the API (#9143)
(expect
  "1000"
  ;; use with temp value macro so original value gets reset after test run
  (tu/with-temporary-setting-values [query-caching-max-kb nil]
    (public-settings/query-caching-max-kb "1000")))
