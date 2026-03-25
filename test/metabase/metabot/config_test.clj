(ns metabase.metabot.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest resolve-dynamic-metabot-id-test
  (testing "metabot ID resolution precedence"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
        (testing "explicit metabot-id takes precedence"
          (is (= "explicit-id"
                 (metabot.config/resolve-dynamic-metabot-id "explicit-id"))))

        (testing "falls back to environment variable"
          (mt/with-temporary-setting-values [metabot.settings/metabot-id "env-metabot-id"]
            (is (= "env-metabot-id"
                   (metabot.config/resolve-dynamic-metabot-id nil)))))

        (testing "falls back to internal default when no explicit or env value"
          (is (= metabot.config/internal-metabot-id
                 (metabot.config/resolve-dynamic-metabot-id nil))))))))

(deftest resolve-dynamic-profile-id-test
  (testing "profile ID resolution precedence"
    (mt/with-premium-features #{:metabot-v3}
      (testing "explicit profile-id takes highest precedence"
        (is (= "explicit-profile"
               (metabot.config/resolve-dynamic-profile-id "explicit-profile" "any-metabot-id"))))

      (testing "metabot-id mapping takes second precedence"
        (is (= "internal"
               (metabot.config/resolve-dynamic-profile-id nil metabot.config/internal-metabot-id)))
        (is (= "embedding_next"
               (metabot.config/resolve-dynamic-profile-id nil metabot.config/embedded-metabot-id))))

      (testing "falls back to default when no matches"
        (is (= "embedding_next"
               (metabot.config/resolve-dynamic-profile-id nil "unknown-metabot-id"))))

      (testing "single arity version uses dynamic metabot resolution"
        (mt/with-temporary-setting-values [metabot.settings/metabot-id metabot.config/embedded-metabot-id]
          (is (= "embedding_next"
                 (metabot.config/resolve-dynamic-profile-id nil))))))))

(deftest integrated-resolution-test
  (testing "combination of metabot-id and profile-id precedence resolution"
    (mt/with-premium-features #{:metabot-v3}
      (testing "explicit params override everything"
        (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
          (let [metabot-id (metabot.config/resolve-dynamic-metabot-id "custom-metabot")
                profile-id (metabot.config/resolve-dynamic-profile-id "custom-profile" metabot-id)]
            (is (= "custom-metabot" metabot-id))
            (is (= "custom-profile" profile-id)))))

      (testing "env metabot-id resolves profile via metabot-id mapping"
        (mt/with-temporary-setting-values [metabot.settings/metabot-id metabot.config/embedded-metabot-id]
          (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)
                profile-id (metabot.config/resolve-dynamic-profile-id nil metabot-id)]
            (is (= metabot.config/embedded-metabot-id metabot-id))
            (is (= "embedding_next" profile-id)))))

      (testing "defaults work together"
        (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
          (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)
                profile-id (metabot.config/resolve-dynamic-profile-id nil metabot-id)]
            (is (= metabot.config/internal-metabot-id metabot-id))
            (is (= "internal" profile-id))))))))
