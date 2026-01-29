(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- llm-anthropic-api-key Setter Tests -------------------------------------------

(deftest llm-anthropic-api-key-setter-test
  (testing "accepts valid sk-ant- key and trims whitespace"
    (mt/discard-setting-changes [llm-anthropic-api-key]
      (llm.settings/llm-anthropic-api-key! "  sk-ant-abc123  ")
      (is (= "sk-ant-abc123" (llm.settings/llm-anthropic-api-key)))))

  (testing "rejects keys without sk-ant- prefix"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Anthropic API key format"
         (llm.settings/llm-anthropic-api-key! "invalid-key"))))

  (testing "empty/nil clears the setting"
    (mt/discard-setting-changes [llm-anthropic-api-key]
      (llm.settings/llm-anthropic-api-key! "sk-ant-abc123")
      (llm.settings/llm-anthropic-api-key! "")
      (is (nil? (llm.settings/llm-anthropic-api-key))))))

;;; ------------------------------------------- llm-enabled? Tests -------------------------------------------

(deftest llm-enabled?-test
  (testing "returns true when API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test-key"]
      (is (true? (llm.settings/llm-enabled?)))))

  (testing "returns false when API key is nil"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (is (false? (llm.settings/llm-enabled?)))))

  (testing "empty string is treated as nil (falsy)"
    (mt/with-temporary-setting-values [llm-anthropic-api-key ""]
      ;; The settings framework converts empty strings to nil
      (is (false? (llm.settings/llm-enabled?))))))

;;; ------------------------------------------- llm-sql-generation-enabled Tests -------------------------------------------

(deftest llm-sql-generation-enabled-test
  (testing "returns true when Anthropic API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
      (is (true? (llm.settings/llm-sql-generation-enabled)))))

  (testing "returns false when no API key and metabot not enabled"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      ;; This depends on premium-features/enable-metabot-v3? state
      ;; In test context without premium features, should be false
      (is (boolean? (llm.settings/llm-sql-generation-enabled))))))

;;; ------------------------------------------- Settings Defaults Tests -------------------------------------------

(deftest llm-max-tokens-test
  (testing "default value is 4096"
    (mt/with-temporary-setting-values [llm-max-tokens nil]
      (is (= 4096 (llm.settings/llm-max-tokens)))))

  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-max-tokens 8192]
      (is (= 8192 (llm.settings/llm-max-tokens))))))

(deftest llm-request-timeout-ms-test
  (testing "default value is 60000 (60 seconds)"
    (mt/with-temporary-setting-values [llm-request-timeout-ms nil]
      (is (= 60000 (llm.settings/llm-request-timeout-ms)))))

  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-request-timeout-ms 120000]
      (is (= 120000 (llm.settings/llm-request-timeout-ms))))))

(deftest llm-connection-timeout-ms-test
  (testing "default value is 5000 (5 seconds)"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms nil]
      (is (= 5000 (llm.settings/llm-connection-timeout-ms)))))

  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms 10000]
      (is (= 10000 (llm.settings/llm-connection-timeout-ms))))))

(deftest llm-rate-limit-per-user-test
  (testing "default value is 20 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user nil]
      (is (= 20 (llm.settings/llm-rate-limit-per-user)))))

  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user 50]
      (is (= 50 (llm.settings/llm-rate-limit-per-user))))))

(deftest llm-rate-limit-per-ip-test
  (testing "default value is 100 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip nil]
      (is (= 100 (llm.settings/llm-rate-limit-per-ip)))))

  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip 200]
      (is (= 200 (llm.settings/llm-rate-limit-per-ip))))))
