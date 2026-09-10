(ns metabase.api-keys.usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.usage :as api-keys.usage]))

(deftest detect-client-test
  (testing "known clients are classified from their User-Agent"
    (are [user-agent expected] (= expected (api-keys.usage/detect-client user-agent))
      "metabase-cli/1.2.3"                      "metabase-cli"
      "curl/8.4.0"                              "curl"
      "PostmanRuntime/7.36.0"                   "postman"
      "python-requests/2.31.0"                  "python-requests"
      "libcurl/8.0.1 r-curl/5.1.0 httr/1.4.7"   "r"
      "got (https://github.com/sindresorhus/got)" "node"))
  (testing "an unrecognized or absent User-Agent is \"other\""
    (are [user-agent] (= "other" (api-keys.usage/detect-client user-agent))
      "Mozilla/5.0 (some browser)"
      ""
      nil))
  (testing "matching is case-insensitive"
    (is (= "curl" (api-keys.usage/detect-client "CURL/8.4.0"))))
  (testing "r-curl is classified as r, not curl, despite containing \"curl\""
    (is (= "r" (api-keys.usage/detect-client "r-curl/5.1.0")))))
