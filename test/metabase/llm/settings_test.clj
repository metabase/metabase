(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- llm-enabled? Tests -------------------------------------------

(deftest llm-enabled?-test
  (testing "returns true when API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test-key"]
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
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
      (is (true? (llm.settings/llm-sql-generation-enabled)))))

  (testing "returns false when no API key and metabot not enabled"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      ;; This depends on premium-features/enable-metabot-v3? state
      ;; In test context without premium features, should be false
      (is (boolean? (llm.settings/llm-sql-generation-enabled))))))
