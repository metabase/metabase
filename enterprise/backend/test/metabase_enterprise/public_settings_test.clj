(ns metabase-enterprise.public-settings-test
  (:require [clojure.test :refer :all]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-turn-off-password-login-with-jwt-enabled
  (tu/with-temporary-setting-values [jwt-enabled               true
                                     jwt-identity-provider-uri "example.com"
                                     jwt-shared-secret         "0123456789012345678901234567890123456789012345678901234567890123"
                                     enable-password-login     true]
    (public-settings/enable-password-login! false)
    (is (= false
           (public-settings/enable-password-login)))))

(deftest application-colors-adds-correct-keys
  (testing "application-colors getter"
    (premium-features-test/with-premium-features #{:whitelabel}
      (tu/with-temporary-setting-values [application-colors {:brand   "#f00"
                                                             :accent1 "#0f0"
                                                             :accent7 "#00f"}
                                         application-colors-migrated false]
        (testing "sets `accent0` to value `brand`, `summarize` to value `accent1`, and `filter` to `accent7`"
          (is (= {:brand     "#f00"
                  :accent0   "#f00"
                  :accent1   "#0f0"
                  :summarize "#0f0"
                  :accent7   "#00f"
                  :filter    "#00f"}
                 (public-settings/application-colors)))
          (testing "and sets `application-colors-migrated` to `true`"
            (is (public-settings/application-colors-migrated)))))
      (tu/with-temporary-setting-values [application-colors {:brand   "#f00"
                                                             :accent1 "#0f0"
                                                             :accent7 "#00f"}
                                         application-colors-migrated true]
        (testing "returns the colors as-is if `application-colors-migrated` is `true`"
          (is (= {:brand     "#f00"
                  :accent1   "#0f0"
                  :accent7   "#00f"}
                 (public-settings/application-colors)))
          (testing "and sets `application-colors-migrated` to `true`"
            (is (public-settings/application-colors-migrated)))))
      (tu/with-temporary-setting-values [application-colors-migrated false]
        (testing "does not set `brand`, `accent1`, or `accent7` if they are not already part of the input"
          (public-settings/application-colors! {:accent0   "#f00"
                                                :summarize "#0f0"
                                                :filter    "#00f"})
          (is (= #{:accent0 :summarize :filter}
                 (set (keys (public-settings/application-colors)))))))
      (tu/with-temporary-setting-values [application-colors-migrated false]
        (testing "respects given values if `accent0`, `summarize`, and `filter` keys are part of the input"
          (public-settings/application-colors! {:brand     "#f00"
                                                :accent0   "#fa0a0a"
                                                :accent1   "#0f0"
                                                :summarize "#0afa0a"
                                                :accent7   "#00f"
                                                :filter    "#0a0afa"})
          (is (= {:brand     "#f00"
                  :accent0   "#fa0a0a"
                  :accent1   "#0f0"
                  :summarize "#0afa0a"
                  :accent7   "#00f"
                  :filter    "#0a0afa"}
                 (public-settings/application-colors))))))))
