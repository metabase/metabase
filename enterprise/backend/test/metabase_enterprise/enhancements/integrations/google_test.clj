(ns metabase-enterprise.enhancements.integrations.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]))

(deftest google-auth-create-new-user!-test
  (with-redefs [premium-features/enable-sso-google? (constantly true)]
    (testing "should support multiple domains (#5218)"
      (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com,example.com"]
        (mt/with-model-cleanup [:model/User]
          (let [user (sso/google-auth-create-new-user! {:first_name "Cam"
                                                        :last_name  "Era"
                                                        :email      "camera@metabase.com"})]
            (is (= {:first_name "Cam", :last_name "Era", :email "camera@metabase.com"}
                   (select-keys user [:first_name :last_name :email])))))))))
