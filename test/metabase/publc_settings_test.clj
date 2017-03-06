(ns metabase.publc-settings-test
  (:require [expectations :refer :all]
            [metabase.public-settings :as public-settings]
            [metabase.test.util :as tu]))

;; double-check that setting the `site-url` setting will automatically strip off trailing slashes
(expect
  "http://localhost:3000"
  (tu/with-temporary-setting-values [site-url nil]
    (public-settings/site-url "http://localhost:3000/")
    (public-settings/site-url)))
