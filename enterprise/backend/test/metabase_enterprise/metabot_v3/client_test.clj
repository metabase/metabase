(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase.test :as mt]))

(deftest request-with-feature-toggle-test
  (testing "request respects metabot feature toggle"
    (mt/with-premium-features #{:metabot-v3}
      (let [test-request {:messages []
                          :context {}
                          :profile-id "test-profile"
                          :conversation-id (str (random-uuid))
                          :session-id (str (random-uuid))
                          :state {}}]

        (testing "when metabot is disabled"
          (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
            (testing "should throw metabot disabled error"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"Metabot is disabled."
                                    (metabot-v3.client/request test-request))))))))))

(deftest streaming-request-with-feature-toggle-test
  (testing "streaming-request respects metabot feature toggle"
    (mt/with-premium-features #{:metabot-v3}
      (let [test-request {:messages []
                          :context {}
                          :profile-id "test-profile"
                          :conversation-id (str (random-uuid))
                          :session-id (str (random-uuid))
                          :state {}}]

        (testing "when metabot is disabled"
          (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
            (testing "should throw metabot disabled error"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"Metabot is disabled."
                                    (metabot-v3.client/streaming-request test-request))))))))))

(deftest metric-selection-request-with-feature-toggle-test
  (testing "metric-selection-request respects metabot feature toggle"
    (let [test-metrics [{:id 1 :name "Test Metric"}]
          test-query "Select a metric"]

      (testing "when metabot is disabled"
        (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
          (testing "should throw metabot disabled error"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Metabot is disabled."
                                  (metabot-v3.client/metric-selection-request test-metrics test-query)))))))))

(deftest find-outliers-request-with-feature-toggle-test
  (testing "find-outliers-request respects metabot feature toggle"
    (let [test-values [{:dimension "A" :value 10}
                       {:dimension "B" :value 100}]]

      (testing "when metabot is disabled"
        (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
          (testing "should throw metabot disabled error"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Metabot is disabled."
                                  (metabot-v3.client/find-outliers-request test-values)))))))))

(deftest sql-gen-request-with-feature-toggle-test
  (testing "sql-gen-request respects metabot feature toggle"
    (let [test-request {:prompt "Generate SQL"
                        :dialect :h2
                        :error_message "Syntax error"}]

      (testing "when metabot is disabled"
        (mt/with-temp-env-var-value! ["MB_METABOT_FEATURE_ENABLED" "false"]
          (testing "should throw metabot disabled error"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Metabot is disabled."
                                  (metabot-v3.client/sql-gen-request test-request)))))))))