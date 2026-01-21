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
          (is (= "internal"
                 (metabot-v3.config/resolve-dynamic-profile-id nil metabot-v3.config/internal-metabot-id)))
          (is (= "embedding_next"
                 (metabot-v3.config/resolve-dynamic-profile-id nil metabot-v3.config/embedded-metabot-id))))

        (testing "falls back to default when no matches"
          (is (= "embedding_next"
                 (metabot-v3.config/resolve-dynamic-profile-id nil "unknown-metabot-id"))))

        (testing "single arity version uses dynamic metabot resolution"
          (mt/with-temporary-setting-values [metabot-v3.settings/metabot-id metabot-v3.config/embedded-metabot-id]
            (is (= "embedding_next"
                   (metabot-v3.config/resolve-dynamic-profile-id nil)))))))))

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
            (is (= "internal" profile-id))))))))
