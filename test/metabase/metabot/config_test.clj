(ns metabase.metabot.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest resolve-dynamic-metabot-id-test
  (testing "metabot ID resolution precedence"
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
               (metabot.config/resolve-dynamic-metabot-id nil)))))))

(deftest resolve-dynamic-profile-id-test
  (testing "profile ID resolution precedence"
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
               (metabot.config/resolve-dynamic-profile-id nil)))))))

(deftest check-metabot-enabled-test
  (testing "0-arity throws when both are disabled, passes when either is enabled"
    (mt/with-temporary-setting-values [metabot-enabled? false embedded-metabot-enabled? false]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Metabot is not enabled"
                            (metabot.config/check-metabot-enabled!))))
    (mt/with-temporary-setting-values [metabot-enabled? true embedded-metabot-enabled? false]
      (is (metabot.config/check-metabot-enabled!))))
  (testing "1-arity checks the specific instance's setting"
    (mt/with-temporary-setting-values [metabot-enabled? false embedded-metabot-enabled? true]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Metabot is not enabled"
                            (metabot.config/check-metabot-enabled! metabot.config/internal-metabot-id)))
      (is (metabot.config/check-metabot-enabled! metabot.config/embedded-metabot-id))))
  (testing "global AI disable blocks all Metabot instances"
    (mt/with-temporary-raw-setting-values [:ai-features-enabled?      "false"
                                           :metabot-enabled?          "true"
                                           :embedded-metabot-enabled? "true"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled!)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled! metabot.config/internal-metabot-id)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled! metabot.config/embedded-metabot-id))))))

(deftest integrated-resolution-test
  (testing "combination of metabot-id and profile-id precedence resolution"
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
          (is (= "internal" profile-id)))))))
