(ns metabase-enterprise.advanced-config.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase.test :as mt]))

(deftest subscription-allowed-domains!-test
  (testing "Should be able to set the subscription-allowed-domains setting with the email-allow-list feature"
    (mt/with-premium-features #{:email-allow-list}
      (is (= "metabase.com"
             (advanced-config.settings/subscription-allowed-domains! "metabase.com")))))
  (testing "Should be unable to set the subscription-allowed-domains setting without the email-allow-list feature"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting subscription-allowed-domains is not enabled because feature :email-allow-list is not available"
           (advanced-config.settings/subscription-allowed-domains! "metabase.com"))))))
