(ns metabase-enterprise.metabot-v3.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase.test :as mt]))

(deftest resolve-dynamic-metabot-id-test
  (testing "metabot ID resolution precedence"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil]
        (testing "explicit metabot-id takes precedence"
          (is (= "explicit-id"
                 (metabot-v3.config/resolve-dynamic-metabot-id "explicit-id"))))

        (testing "falls back to environment variable"
          (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id "env-metabot-id"]
            (is (= "env-metabot-id"
                   (metabot-v3.config/resolve-dynamic-metabot-id nil)))))

        (testing "falls back to internal default when no explicit or env value"
          (is (= metabot-v3.config/internal-metabot-id
                 (metabot-v3.config/resolve-dynamic-metabot-id nil))))))))

(deftest resolve-dynamic-profile-id-test
  (testing "profile ID resolution precedence"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id nil]
        (testing "explicit profile-id takes highest precedence"
          (is (= "explicit-profile"
                 (metabot-v3.config/resolve-dynamic-profile-id "explicit-profile" "any-metabot-id"))))

        (testing "environment variable takes second precedence"
          (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id "env-profile"]
            (is (= "env-profile"
                   (metabot-v3.config/resolve-dynamic-profile-id nil "any-metabot-id")))))

        (testing "metabot-id mapping takes third precedence"
          (is (= "experimental"
                 (metabot-v3.config/resolve-dynamic-profile-id nil metabot-v3.config/internal-metabot-id)))
          (is (= "default"
                 (metabot-v3.config/resolve-dynamic-profile-id nil metabot-v3.config/embedded-metabot-id))))

        (testing "falls back to default when no matches"
          (is (= "default"
                 (metabot-v3.config/resolve-dynamic-profile-id nil "unknown-metabot-id"))))

        (testing "single arity version uses dynamic metabot resolution"
          (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id metabot-v3.config/embedded-metabot-id]
            (is (= "default"
                   (metabot-v3.config/resolve-dynamic-profile-id nil)))))))))

(deftest validate-profile-id-against-whitelist-test
  (testing "profile ID whitelist validation"
    (mt/with-premium-features #{:metabot-v3}
      (testing "returns nil when whitelist is not configured"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist nil]
          (is (nil? (metabot-v3.config/validate-profile-id-against-whitelist "profile1")))))

      (testing "returns nil when whitelist is empty string"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist ""]
          (is (nil? (metabot-v3.config/validate-profile-id-against-whitelist "profile1")))))

      (testing "validates profile ID in whitelist"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist "profile1,profile2,profile3"]
          (is (= "profile1" (metabot-v3.config/validate-profile-id-against-whitelist "profile1")))
          (is (= "profile2" (metabot-v3.config/validate-profile-id-against-whitelist "profile2")))
          (is (= "profile3" (metabot-v3.config/validate-profile-id-against-whitelist "profile3")))))

      (testing "returns nil for profile ID not in whitelist"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist "profile1,profile2"]
          (is (nil? (metabot-v3.config/validate-profile-id-against-whitelist "profile3")))
          (is (nil? (metabot-v3.config/validate-profile-id-against-whitelist "unknown")))))

      (testing "case insensitive comparison"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist "Profile1,PROFILE2"]
          (is (= "profile1" (metabot-v3.config/validate-profile-id-against-whitelist "PROfile1")))
          (is (= "profile2" (metabot-v3.config/validate-profile-id-against-whitelist "Profile2")))))

      (testing "trims whitespace from whitelist entries and input"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist " profile1 , profile2 "]
          (is (= "profile1" (metabot-v3.config/validate-profile-id-against-whitelist " profile1 ")))
          (is (= "profile2" (metabot-v3.config/validate-profile-id-against-whitelist "profile2")))))

      (testing "returns nil for nil input"
        (mt/with-temporary-setting-values [metabot-v3.settings/ai-service-profile-id-whitelist "profile1"]
          (is (nil? (metabot-v3.config/validate-profile-id-against-whitelist nil))))))))

(deftest integrated-resolution-test
  (testing "combination of metabot-id and profile-id precedence resolution"
    (mt/with-premium-features #{:metabot-v3}
      (testing "explicit params override everything"
        (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil
                                           metabot-v3.settings/ai-service-profile-id nil]
          (let [metabot-id (metabot-v3.config/resolve-dynamic-metabot-id "custom-metabot")
                profile-id (metabot-v3.config/resolve-dynamic-profile-id "custom-profile" metabot-id)]
            (is (= "custom-metabot" metabot-id))
            (is (= "custom-profile" profile-id)))))

      (testing "environment variables work together"
        (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id "env-metabot"
                                           metabot-v3.settings/ai-service-profile-id "env-profile"]
          (let [metabot-id (metabot-v3.config/resolve-dynamic-metabot-id nil)
                profile-id (metabot-v3.config/resolve-dynamic-profile-id nil metabot-id)]
            (is (= "env-metabot" metabot-id))
            (is (= "env-profile" profile-id)))))

      (testing "defaults work together"
        (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil
                                           metabot-v3.settings/ai-service-profile-id nil]
          (let [metabot-id (metabot-v3.config/resolve-dynamic-metabot-id nil)
                profile-id (metabot-v3.config/resolve-dynamic-profile-id nil metabot-id)]
            (is (= metabot-v3.config/internal-metabot-id metabot-id))
            (is (= "experimental" profile-id)))))

      (testing "whitelist validation in dynamic resolution"
        (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil
                                           metabot-v3.settings/ai-service-profile-id nil
                                           metabot-v3.settings/ai-service-profile-id-whitelist "allowed-profile"]
          (testing "allowed profile ID passes through"
            (let [validated-profile (metabot-v3.config/validate-profile-id-against-whitelist "allowed-profile")
                  profile-id (metabot-v3.config/resolve-dynamic-profile-id validated-profile nil)]
              (is (= "allowed-profile" validated-profile))
              (is (= "allowed-profile" profile-id))))

          (testing "blocked profile ID falls back to defaults"
            (let [validated-profile (metabot-v3.config/validate-profile-id-against-whitelist "blocked-profile")
                  profile-id (metabot-v3.config/resolve-dynamic-profile-id validated-profile metabot-v3.config/internal-metabot-id)]
              (is (nil? validated-profile))
              (is (= "experimental" profile-id)))))))))
