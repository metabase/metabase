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
  [{:keys [metabot-v3? managed-ai? configured?]} thunk]
  (mt/with-temporary-setting-values [has-user-setup true]
    (mt/with-dynamic-fn-redefs [premium-features/canonically-has-feature?
                                (fn [feature]
                                  (case feature
                                    :metabot-v3          metabot-v3?
                                    :metabase-ai-managed managed-ai?))
                                metabot.settings/llm-metabot-configured? (constantly (boolean configured?))]
      (thunk))))

(defmacro ^:private with-entitlements
  "Runs `body` with the token features and Metabot configured-ness pinned. `opts` is a map of `:metabot-v3?` and
  `:managed-ai?` — tri-state, since [[premium-features/canonically-has-feature?]] answers nil before the token
  status is known — and `:configured?`."
  {:style/indent 1}
  [opts & body]
  `(do-with-entitlements! ~opts (fn [] ~@body)))

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
        (with-entitlements {:metabot-v3? true :managed-ai? false}
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-skips-fresh-instances-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements {:metabot-v3? true :managed-ai? false}
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
            (with-entitlements {:metabot-v3? legacy-result :managed-ai? managed-result}
              (llm.startup/check-and-sync-settings-on-startup!)
              (is (= (case [legacy-result managed-result]
                       [true false] metabot.settings/default-metabase-llm-metabot-provider
                       nil)
                     (setting/db-stored-value :llm-metabot-provider))))))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-configured-byok-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements {:metabot-v3? true :managed-ai? false :configured? true}
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-does-not-overwrite-explicit-provider-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
        (with-entitlements {:metabot-v3? true :managed-ai? false}
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= "openai/gpt-4.1-mini"
                 (metabot.settings/llm-metabot-provider))))))))

(deftest check-and-sync-settings-on-startup-syncs-blank-provider-test
  (with-llm-proxy "https://proxy.example.com"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider ""]
        (with-entitlements {:metabot-v3? true :managed-ai? false}
          (llm.startup/check-and-sync-settings-on-startup!)
          (is (= metabot.settings/default-metabase-llm-metabot-provider
                 (metabot.settings/llm-metabot-provider))))))))

(deftest managed-connection-is-materialized-only-by-the-legacy-sync-test
  (testing "switching a legacy instance to the managed provider materializes the connection it names"
    (with-llm-proxy "https://proxy.example.com"
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements {:metabot-v3? true :managed-ai? false}
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= [{:key "metabase" :type "metabase" :name "Metabase AI service" :config {}}]
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
          (with-entitlements {:metabot-v3? nil :managed-ai? nil}
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= [] (vec (llm.settings/llm-providers)))))))))
  (testing "an existing connection list keeps its entries"
    (with-llm-proxy "https://proxy.example.com"
      (mt/with-temporary-setting-values [llm-providers [{:key    "anthropic"
                                                         :type   "anthropic"
                                                         :name   "Anthropic"
                                                         :config {:api-key "sk-ant-stored"}}]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (with-entitlements {:metabot-v3? true :managed-ai? false}
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= ["anthropic" "metabase"] (map :key (llm.settings/llm-providers))))))))))

(deftest managed-connection-is-not-written-when-the-list-is-env-managed-test
  (testing (str "A write would land in the app DB and lose to the env var on every read, so pointing Metabot at the "
                "managed provider would name a connection that never resolves. Leave the selection alone instead.")
    (mt/with-temp-env-var-value! [mb-llm-providers "[{\"key\":\"anthropic\",\"type\":\"anthropic\",\"name\":\"Anthropic\",\"config\":{\"api-key\":\"sk-ant-env\"}}]"]
      (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
        (with-entitlements {:metabot-v3? true :managed-ai? false}
          (let [stored-before (setting/db-stored-value :llm-providers)]
            (llm.startup/check-and-sync-settings-on-startup!)
            (is (= stored-before (setting/db-stored-value :llm-providers)))
            (is (nil? (setting/db-stored-value :llm-metabot-provider)))))))))
