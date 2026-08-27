(ns metabase-enterprise.sso.integrations.saml-utils-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.saml-utils :as saml-utils]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel create-token-response-includes-nonce-attribute-test
  (testing "create-token-response emits <script nonce=\"...\"> with the provided nonce"
    (let [nonce    "abc123XYZ09"
          response (saml-utils/create-token-response {:key "session-key"}
                                                     "https://app.example"
                                                     "https://app.example/dest"
                                                     nonce)]
      (is (= 200 (:status response)))
      (is (= "text/html" (get-in response [:headers "Content-Type"])))
      (is (str/includes? (:body response)
                         (str "<script nonce=\"" nonce "\">"))))))

(deftest ^:parallel popup-values-are-json-encoded-test
  (testing "the popup script uses JSON-encoded values"
    (let [origin-with-apostrophe "https://app.example/it's"
          body                   (:body (saml-utils/create-token-response {:key "session-key"}
                                                                          origin-with-apostrophe
                                                                          "https://app.example/dest"
                                                                          "noncevalue1"))]
      (testing "the postMessage target is JSON-encoded"
        (is (not (str/includes? body "}, '"))
            "postMessage target must not use single quotes")
        (is (str/includes? body (str "}, " (json/encode origin-with-apostrophe) ")"))
            "postMessage target must be JSON-encoded"))
      (testing "the session key is JSON-encoded"
        (is (str/includes? body (str "id: " (json/encode "session-key")))
            "session key must be JSON-encoded")))))
