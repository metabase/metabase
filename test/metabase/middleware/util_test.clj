(ns metabase.middleware.util-test
  (:require [expectations :refer [expect]]
            [metabase.middleware.util :as mw.util]))

(defn- https? [headers]
  (mw.util/https-request? {:headers headers}))

(expect true  (https? {"x-forwarded-proto" "https"}))
(expect false (https? {"x-forwarded-proto" "http"}))

(expect true  (https? {"x-forwarded-protocol" "https"}))
(expect false (https? {"x-forwarded-protocol" "http"}))

(expect true  (https? {"x-url-scheme" "https"}))
(expect false (https? {"x-url-scheme" "http"}))

(expect true  (https? {"x-forwarded-ssl" "on"}))
(expect false (https? {"x-forwarded-ssl" "off"}))

(expect true  (https? {"front-end-https" "on"}))
(expect false (https? {"front-end-https" "off"}))

(expect true  (https? {"origin" "https://mysite.com"}))
(expect false (https? {"origin" "http://mysite.com"}))
