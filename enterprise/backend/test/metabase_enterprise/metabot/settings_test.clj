(ns metabase-enterprise.metabot.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.settings :as metabot.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ai-usage-max-retention-days-default-test
  (testing "defaults to 180 days when no env var is set"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days nil]
      (is (= 180 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-infinite-test
  (testing "0 is an alias for infinite retention"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
      (is (= ##Inf (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-passthrough-test
  (testing "values at or above the minimum pass through unchanged"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 100]
      (is (= 100 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-clamp-test
  (testing "values below the minimum are clamped up to 30"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 1]
      (is (= 30 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-read-only-test
  (testing "the setting is env-var-only and cannot be set at runtime"
    (is (thrown-with-msg?
         java.lang.UnsupportedOperationException
         #"You cannot set ai-usage-max-retention-days"
         (setting/set! :ai-usage-max-retention-days 30)))))
