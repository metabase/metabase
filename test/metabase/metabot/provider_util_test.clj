(ns metabase.metabot.provider-util-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.provider-util :as provider-util]))

(deftest ^:parallel metabase-provider?-test
  (testing "returns true for metabase/ prefixed providers"
    (is (true? (provider-util/metabase-provider? "metabase/anthropic/claude-haiku-4-5")))
    (is (true? (provider-util/metabase-provider? "metabase/openai/gpt-4.1-mini")))
    (is (true? (provider-util/metabase-provider? "metabase/openrouter/anthropic/claude-haiku-4-5"))))
  (testing "returns false for direct providers"
    (is (false? (provider-util/metabase-provider? "anthropic/claude-haiku-4-5")))
    (is (false? (provider-util/metabase-provider? "openrouter/anthropic/claude-haiku-4-5"))))
  (testing "returns false for nil and empty string"
    (is (false? (provider-util/metabase-provider? nil)))
    (is (false? (provider-util/metabase-provider? "")))))

(deftest ^:parallel provider-and-model->outer-provider-test
  (testing "returns top-level prefix"
    (is (= "anthropic" (provider-util/provider-and-model->outer-provider "anthropic/claude-haiku-4-5")))
    (is (= "openrouter" (provider-util/provider-and-model->outer-provider "openrouter/anthropic/claude-haiku-4-5")))
    (is (= "metabase" (provider-util/provider-and-model->outer-provider "metabase/anthropic/claude-haiku-4-5"))))
  (testing "returns nil for nil and empty string"
    (is (nil? (provider-util/provider-and-model->outer-provider nil)))
    (is (= "" (provider-util/provider-and-model->outer-provider "")))))

(deftest ^:parallel provider-and-model->provider-test
  (testing "direct providers"
    (is (= "anthropic" (provider-util/provider-and-model->provider "anthropic/claude-haiku-4-5")))
    (is (= "openai" (provider-util/provider-and-model->provider "openai/gpt-4.1-mini")))
    (is (= "openrouter" (provider-util/provider-and-model->provider "openrouter/anthropic/claude-haiku-4-5"))))
  (testing "metabase/ prefix extracts inner provider"
    (is (= "anthropic" (provider-util/provider-and-model->provider "metabase/anthropic/claude-haiku-4-5")))
    (is (= "openai" (provider-util/provider-and-model->provider "metabase/openai/gpt-4.1-mini")))
    (is (= "openrouter" (provider-util/provider-and-model->provider "metabase/openrouter/anthropic/claude-haiku-4-5"))))
  (testing "returns nil for nil and empty string"
    (is (nil? (provider-util/provider-and-model->provider nil)))
    (is (= "" (provider-util/provider-and-model->provider "")))))

(deftest ^:parallel provider-and-model->model-test
  (testing "direct providers"
    (is (= "claude-haiku-4-5" (provider-util/provider-and-model->model "anthropic/claude-haiku-4-5")))
    (is (= "gpt-4.1-mini" (provider-util/provider-and-model->model "openai/gpt-4.1-mini")))
    (is (= "anthropic/claude-haiku-4-5" (provider-util/provider-and-model->model "openrouter/anthropic/claude-haiku-4-5"))))
  (testing "metabase/ prefix extracts model past inner provider"
    (is (= "claude-haiku-4-5" (provider-util/provider-and-model->model "metabase/anthropic/claude-haiku-4-5")))
    (is (= "gpt-4.1-mini" (provider-util/provider-and-model->model "metabase/openai/gpt-4.1-mini")))
    (is (= "anthropic/claude-haiku-4-5" (provider-util/provider-and-model->model "metabase/openrouter/anthropic/claude-haiku-4-5"))))
  (testing "returns nil for nil and empty string"
    (is (nil? (provider-util/provider-and-model->model nil)))
    (is (nil? (provider-util/provider-and-model->model "")))))

(deftest ^:parallel strip-metabase-prefix-test
  (testing "strips metabase/ prefix"
    (is (= "anthropic/claude-haiku-4-5" (provider-util/strip-metabase-prefix "metabase/anthropic/claude-haiku-4-5")))
    (is (= "openrouter/anthropic/claude-haiku-4-5" (provider-util/strip-metabase-prefix "metabase/openrouter/anthropic/claude-haiku-4-5"))))
  (testing "returns input unchanged when no prefix"
    (is (= "anthropic/claude-haiku-4-5" (provider-util/strip-metabase-prefix "anthropic/claude-haiku-4-5")))
    (is (= "openrouter/anthropic/claude-haiku-4-5" (provider-util/strip-metabase-prefix "openrouter/anthropic/claude-haiku-4-5")))))
