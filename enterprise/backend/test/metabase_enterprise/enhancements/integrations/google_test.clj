(ns metabase-enterprise.enhancements.integrations.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.integrations.google :as google]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]))

(deftest google-auth-create-new-user!-test
  (with-redefs [premium-features/enable-sso-google? (constantly true)]
    (testing "should support multiple domains (#5218)"
      (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com,example.com"]
        (mt/with-model-cleanup [User]
          (let [user (#'google/google-auth-create-new-user! {:first_name "Cam"
                                                             :last_name  "Era"
                                                             :email      "camera@metabase.com"})]
            (is (= {:first_name "Cam", :last_name "Era", :email "camera@metabase.com"}
                   (select-keys user [:first_name :last_name :email])))))))))
