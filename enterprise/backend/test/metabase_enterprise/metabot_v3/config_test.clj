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

(deftest validate-id-against-whitelist-test
  (testing "generalized ID whitelist validation"
    (testing "returns nil when whitelist is not configured"
      (is (nil? (metabot-v3.config/validate-id-against-whitelist "id1" nil))))

    (testing "returns nil when whitelist is empty string"
      (is (nil? (metabot-v3.config/validate-id-against-whitelist "id1" "")))
      (is (nil? (metabot-v3.config/validate-id-against-whitelist "id1" "   "))))

    (testing "validates ID in whitelist"
      (let [whitelist "id1,id2,id3"]
        (is (= "id1" (metabot-v3.config/validate-id-against-whitelist "id1" whitelist)))
        (is (= "id2" (metabot-v3.config/validate-id-against-whitelist "id2" whitelist)))
        (is (= "id3" (metabot-v3.config/validate-id-against-whitelist "id3" whitelist)))))

    (testing "returns nil for ID not in whitelist"
      (let [whitelist "id1,id2"]
        (is (nil? (metabot-v3.config/validate-id-against-whitelist "id3" whitelist)))
        (is (nil? (metabot-v3.config/validate-id-against-whitelist "unknown" whitelist)))))

    (testing "case insensitive comparison"
      (let [whitelist "Id1,ID2"]
        (is (= "id1" (metabot-v3.config/validate-id-against-whitelist "id1" whitelist)))
        (is (= "id2" (metabot-v3.config/validate-id-against-whitelist "Id2" whitelist)))))

    (testing "trims whitespace from whitelist entries and input"
      (let [whitelist " id1 , id2 "]
        (is (= "id1" (metabot-v3.config/validate-id-against-whitelist " id1 " whitelist)))
        (is (= "id2" (metabot-v3.config/validate-id-against-whitelist "id2" whitelist)))))

    (testing "returns nil for nil input"
      (is (nil? (metabot-v3.config/validate-id-against-whitelist nil "id1"))))))

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
            (let [validated-profile (metabot-v3.config/validate-id-against-whitelist "allowed-profile" (metabot-v3.settings/ai-service-profile-id-whitelist))
                  profile-id (metabot-v3.config/resolve-dynamic-profile-id validated-profile nil)]
              (is (= "allowed-profile" validated-profile))
              (is (= "allowed-profile" profile-id))))

          (testing "blocked profile ID falls back to defaults"
            (let [validated-profile (metabot-v3.config/validate-id-against-whitelist "blocked-profile" (metabot-v3.settings/ai-service-profile-id-whitelist))
                  profile-id (metabot-v3.config/resolve-dynamic-profile-id validated-profile metabot-v3.config/internal-metabot-id)]
              (is (nil? validated-profile))
              (is (= "experimental" profile-id))))))

      (testing "metabot-id whitelist validation in dynamic resolution"
        (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id nil
                                           metabot-v3.settings/ai-service-profile-id nil
                                           metabot-v3.settings/metabot-id-whitelist "allowed-metabot"]
          (testing "allowed metabot ID passes through"
            (let [validated-metabot (metabot-v3.config/validate-id-against-whitelist "allowed-metabot" (metabot-v3.settings/metabot-id-whitelist))
                  metabot-id (metabot-v3.config/resolve-dynamic-metabot-id validated-metabot)]
              (is (= "allowed-metabot" validated-metabot))
              (is (= "allowed-metabot" metabot-id))))

          (testing "blocked metabot ID falls back to defaults"
            (let [validated-metabot (metabot-v3.config/validate-id-against-whitelist "blocked-metabot" (metabot-v3.settings/metabot-id-whitelist))
                  metabot-id (metabot-v3.config/resolve-dynamic-metabot-id validated-metabot)]
              (is (nil? validated-metabot))
              (is (= metabot-v3.config/internal-metabot-id metabot-id)))))))))
