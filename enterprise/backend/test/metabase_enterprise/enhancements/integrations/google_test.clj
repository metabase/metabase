(ns metabase-enterprise.enhancements.integrations.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest google-auth-create-new-user!-test
  (mt/with-premium-features #{:sso-google}
    (testing "should support multiple domains (#5218)"
      (mt/with-temporary-setting-values [google-auth-auto-create-accounts-domain "metabase.com,example.com"]
        (mt/with-model-cleanup [:model/User]
          (let [user (sso/google-auth-create-new-user! {:first_name "Cam"
                                                        :last_name  "Era"
                                                        :email      "camera@metabase.com"})]
            (is (= {:first_name "Cam", :last_name "Era", :email "camera@metabase.com"}
                   (select-keys user [:first_name :last_name :email])))))))))
