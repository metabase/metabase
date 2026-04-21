(ns metabase.llm.startup-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.startup :as llm.startup]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest check-and-sync-settings-on-startup-syncs-legacy-metabot-default-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/discard-setting-changes [llm-metabot-provider]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-redefs [premium-features/canonically-has-feature?
                      (fn [feature]
                        (case feature
                          :metabot-v3 true
                          :metabase-ai-managed false))
                      metabot.settings/llm-metabot-configured? (constantly false)]
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-feature-permutations-test
  (doseq [legacy-result [nil false true]
          managed-result [nil false true]]
    (testing (format ":metabot-v3=%s :metabase-ai-managed=%s" legacy-result managed-result)
      (mt/with-premium-features #{:metabot-v3}
        (mt/discard-setting-changes [llm-metabot-provider]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
            (with-redefs [premium-features/canonically-has-feature?
                          (fn [feature]
                            (case feature
                              :metabot-v3 legacy-result
                              :metabase-ai-managed managed-result))
                          metabot.settings/llm-metabot-configured? (constantly false)]
              (llm.startup/check-and-sync-settings-on-startup!)
              (is (= (case [legacy-result managed-result]
                       [true false] metabot.settings/default-metabase-llm-metabot-provider
                       nil)
                     (setting/db-stored-value :llm-metabot-provider))))))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-configured-byok-test
  (mt/discard-setting-changes [llm-metabot-provider]
    (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
      (with-redefs [premium-features/canonically-has-feature?
                    (fn [feature]
                      (case feature
                        :metabot-v3 true
                        :metabase-ai-managed false))
                    metabot.settings/llm-metabot-configured? (constantly true)]
        (llm.startup/check-and-sync-settings-on-startup!)
        (is (= metabot.settings/default-llm-metabot-provider
               (metabot.settings/llm-metabot-provider)))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-explicit-provider-test
  (mt/discard-setting-changes [llm-metabot-provider]
    (mt/with-temporary-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
      (with-redefs [premium-features/canonically-has-feature?
                    (fn [feature]
                      (case feature
                        :metabot-v3 true
                        :metabase-ai-managed false))
                    metabot.settings/llm-metabot-configured? (constantly false)]
        (llm.startup/check-and-sync-settings-on-startup!)
        (is (= "openai/gpt-4.1-mini"
               (metabot.settings/llm-metabot-provider)))))))

(deftest check-and-sync-settings-on-startup-syncs-blank-provider-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/discard-setting-changes [llm-metabot-provider]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider ""]
        (with-redefs [premium-features/canonically-has-feature?
                      (fn [feature]
                        (case feature
                          :metabot-v3 true
                          :metabase-ai-managed false))
                      metabot.settings/llm-metabot-configured? (constantly false)]
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))
