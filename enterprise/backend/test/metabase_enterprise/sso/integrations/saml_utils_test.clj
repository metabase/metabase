(ns metabase-enterprise.sso.integrations.saml-utils-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.saml-utils :as saml-utils]))

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
