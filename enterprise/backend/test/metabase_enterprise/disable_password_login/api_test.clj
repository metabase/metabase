(ns metabase-enterprise.disable-password-login.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]))

(deftest toggle-disable-password-login-require-token-test
  (mt/discard-setting-changes [enable-password-login]
    (testing "fail to set :enable-password-login if does not have :disable-password-login feature"
      (mt/user-http-request :crowberto :put 404 "/api/setting/enable-password-login" {:value false}))
    (testing "able to set :enable-password-login if has :disable-password-login feature"
      (premium-features-test/with-premium-features #{:disable-password-login}
        (mt/user-http-request :crowberto :put 404 "/api/setting/enable-password-login" {:value false})))))
