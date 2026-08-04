(ns metabase.llm.startup-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.startup :as llm.startup]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- do-with-entitlements!
  [legacy-result managed-result configured? thunk]
  (mt/with-temporary-setting-values [has-user-setup true]
    (mt/with-dynamic-fn-redefs [premium-features/canonically-has-feature?
                                (fn [feature]
                                  (case feature
                                    :metabot-v3          legacy-result
                                    :metabase-ai-managed managed-result))
                                metabot.settings/llm-metabot-configured? (constantly configured?)]
      (thunk))))

(defmacro ^:private with-entitlements
  [legacy-result managed-result configured? & body]
  `(do-with-entitlements! ~legacy-result ~managed-result ~configured? (fn [] ~@body)))

(defn- do-with-llm-proxy!
  [url thunk]
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [llm-proxy-base-url url]
      (thunk))))

(defmacro ^:private with-llm-proxy
  [url & body]
  `(do-with-llm-proxy! ~url (fn [] ~@body)))

(deftest check-and-sync-settings-on-startup-syncs-legacy-metabot-default-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements true false false
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-skips-fresh-instances-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements true false false
          (mt/with-temporary-setting-values [has-user-setup false]
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (nil? (setting/db-stored-value :llm-metabot-provider)))
            (is (= [] (vec (llm.settings/llm-providers))))))))))

(deftest check-and-sync-settings-on-startup-feature-permutations-test
  (doseq [legacy-result  [nil false true]
          managed-result [nil false true]]
    (testing (format ":metabot-v3=%s :metabase-ai-managed=%s" legacy-result managed-result)
      (with-llm-proxy "https://proxy.example.com"
        (mt/with-temporary-setting-values [llm-providers []]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
            (with-entitlements legacy-result managed-result false
              (llm.startup/check-and-sync-settings-on-startup!)
              (is (= (case [legacy-result managed-result]
                       [true false] metabot.settings/default-metabase-llm-metabot-provider
                       nil)
                     (setting/db-stored-value :llm-metabot-provider))))))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-configured-byok-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements true false true
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-explicit-provider-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
        (with-entitlements true false false
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= "openai/gpt-4.1-mini"
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-syncs-blank-provider-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider ""]
        (with-entitlements true false false
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest managed-connection-is-materialized-only-by-the-legacy-sync-test
  (testing "switching a legacy instance to the managed provider materializes the connection it names"
    (with-llm-proxy "https://proxy.example.com"
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements true false false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= [{:key "metabase" :type "metabase" :name "Metabase" :config {}}]
                   (vec (llm.settings/llm-providers))))
            (testing "and the reference it just wrote resolves against it"
              (is (=? {:connection-key "metabase" :type "anthropic" :ai-proxy? true}
                      (llm.provider/resolve-model-ref (metabot.settings/llm-metabot-provider)))))
            (testing "and is not added a second time"
              (llm.startup/check-and-sync-settings-on-startup!)
              (is (= ["metabase"] (map :key (llm.settings/llm-providers))))))))))
  (testing "a configured proxy on its own does not connect the managed provider"
    (with-llm-proxy "https://proxy.example.com"
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements nil nil false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= [] (vec (llm.settings/llm-providers)))))))))
  (testing "an existing connection list keeps its entries"
    (with-llm-proxy "https://proxy.example.com"
      (mt/with-temporary-setting-values [llm-providers [{:key    "anthropic"
                                                         :type   "anthropic"
                                                         :name   "Anthropic"
                                                         :config {:api-key "sk-ant-stored"}}]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements true false false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= ["anthropic" "metabase"] (map :key (llm.settings/llm-providers))))))))))

(deftest managed-connection-is-migrated-for-an-instance-already-using-it-test
  (testing "an instance whose saved provider is the managed one gets a connection for it"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-stored"]
        (mt/with-temporary-raw-setting-values
          [llm-providers        nil
           llm-metabot-provider metabot.settings/default-metabase-llm-metabot-provider]
          (with-entitlements nil nil false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= #{"anthropic" "metabase"}
                   (set (map :key (llm.settings/llm-providers)))))))))))

(deftest adopts-db-stored-credential-settings-onto-llm-providers-test
  (testing "credentials stored in the app DB become connections keyed by their provider type"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key      nil
                                  mb-llm-openai-api-key         nil
                                  mb-llm-bedrock-access-key-id  nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-stored"
                                         llm-openai-api-key    "sk-stored"]
        (mt/with-temporary-raw-setting-values [llm-providers        nil
                                               llm-metabot-provider "anthropic/claude-opus-4-1"]
          (with-entitlements nil nil false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= #{"anthropic" "openai"} (set (map :key (llm.settings/llm-providers)))))
            (is (= {:api-key "sk-ant-stored"} (llm.provider/credentials "anthropic")))
            (is (= {:api-key "sk-stored"} (llm.provider/credentials "openai")))
            (testing "so the model reference the instance already had keeps resolving"
              (is (=? {:connection-key "anthropic" :type "anthropic" :model "claude-opus-4-1"}
                      (llm.provider/resolve-model-ref (metabot.settings/llm-metabot-provider)))))))))))

(deftest adoption-skips-incomplete-and-env-set-credentials-test
  (testing "a partial credential set does not become a connection"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id     nil
                                  mb-llm-bedrock-secret-access-key nil
                                  mb-llm-anthropic-api-key         nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key         nil
                                         llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                         llm-bedrock-secret-access-key nil]
        (mt/with-temporary-raw-setting-values [llm-providers        nil
                                               llm-metabot-provider nil]
          (with-entitlements nil nil false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (nil? (setting/db-stored-value :llm-providers))))))))
  (testing "credentials that come from an env var stay configured by the environment, resolved on every read"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
      (mt/with-temporary-raw-setting-values [llm-providers        nil
                                             llm-metabot-provider nil]
        (with-entitlements nil nil false
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (nil? (setting/db-stored-value :llm-providers)))
          (is (= [["anthropic" :env]]
                 (map (juxt :key :source) (llm.provider/connections)))))))))

(deftest adoption-is-a-one-shot-test
  (testing "an instance that already has a connection list is not adopted over again"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-stored"
                                         llm-providers         []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements nil nil false
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= [] (vec (llm.settings/llm-providers))))))))))
