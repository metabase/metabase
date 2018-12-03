(ns metabase.public-settings-test
  (:require [expectations :refer :all]
            [metabase.public-settings :as public-settings]
            [metabase.test.util :as tu]
            [puppetlabs.i18n.core :as i18n :refer [tru trs]]))

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
