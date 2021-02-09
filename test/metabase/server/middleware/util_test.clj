(ns metabase.server.middleware.util-test
  (:require [clojure.test :refer :all]
            [metabase.server.middleware.util :as mw.util]))

(deftest https-request?-test
  (doseq [[headers expected] {{"x-forwarded-proto" "https"}    true
                              {"x-forwarded-proto" "http"}     false
                              {"x-forwarded-protocol" "https"} true
                              {"x-forwarded-protocol" "http"}  false
                              {"x-url-scheme" "https"}         true
                              {"x-url-scheme" "http"}          false
                              {"x-forwarded-ssl" "on"}         true
                              {"x-forwarded-ssl" "off"}        false
                              {"front-end-https" "on"}         true
                              {"front-end-https" "off"}        false
                              {"origin" "https://mysite.com"}  true
                              {"origin" "http://mysite.com"}   false}]
    (testing (pr-str (list 'https-request? {:headers headers}))
      (is (= expected
             (mw.util/https-request? {:headers headers}))))))
