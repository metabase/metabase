(ns metabase-enterprise.public-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.embed.settings :as embed.settings]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-turn-off-password-login-with-jwt-enabled
  (mt/with-premium-features #{:sso-jwt}
    (tu/with-temporary-setting-values [jwt-enabled               true
                                       jwt-identity-provider-uri "example.com"
                                       jwt-shared-secret         "0123456789012345678901234567890123456789012345678901234567890123"
                                       enable-password-login     true]
      (testing "can't change enable-password-login setting if disabled-password-login feature is disabled"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting enable-password-login is not enabled because feature :disable-password-login is not available"
             (public-settings/enable-password-login! false))))

      (testing "can change enable-password-login setting if jwt enabled and have disabled-password-login feature"
        (mt/with-additional-premium-features #{:disable-password-login}
          (public-settings/enable-password-login! false)
          (is (= false
                 (public-settings/enable-password-login))))))))

(deftest toggle-full-app-embedding-test
  (mt/discard-setting-changes [embedding-app-origin]
    (testing "can't change embedding-app-origin if :embedding feature is not available"
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting embedding-app-origin is not enabled because feature :embedding is not available"
             (embed.settings/embedding-app-origin! "https://metabase.com")))

        (testing "even if env is set, return the default value"
          (mt/with-temp-env-var-value! [mb-embedding-app-origin "https://metabase.com"]
            (is (nil? (embed.settings/embedding-app-origin)))))))

    (testing "can change embedding-app-origin if :embedding is enabled"
      (mt/with-premium-features #{:embedding}
        (embed.settings/embedding-app-origin! "https://metabase.com")
        (is (= "https://metabase.com"
               (embed.settings/embedding-app-origin)))

        (testing "it works with env too"
          (mt/with-temp-env-var-value! [mb-embedding-app-origin "ssh://metabase.com"]
            (is (= "ssh://metabase.com"
                   (embed.settings/embedding-app-origin)))))))))
