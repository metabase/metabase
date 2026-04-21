(ns metabase.metabot.api.entity-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(deftest analyze-chart-test
  (testing "POST /api/ai-entity-analysis/analyze-chart"
    (with-redefs [metabot/analyze-chart (constantly {:analysis "This chart shows a steady increase in sales over time, with a notable peak in Q4."})]
      (let [response (mt/user-http-request :rasta :post 200 "ai-entity-analysis/analyze-chart"
                                           {:image_base64 "base64encodedimage"
                                            :name "Sales Trend"
                                            :description "Quarterly sales data"
                                            :timeline_events [{:name "Product Launch"
                                                               :description "New product line introduced"
                                                               :timestamp "2023-04-15"}]})]
        (is (= {:summary "This chart shows a steady increase in sales over time, with a notable peak in Q4."}
               response))))))

(deftest analyze-chart-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                       "metabase/anthropic/claude-sonnet-4-6"]
      (with-redefs [premium-features/token-status
                    (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                               :is-locked   true}}})
                    metabot/analyze-chart
                    (fn [& _]
                      (throw (ex-info "should not call analyze-chart" {})))]
        (let [response (mt/user-http-request :rasta :post 402 "ai-entity-analysis/analyze-chart"
                                             {:image_base64 "base64encodedimage"
                                              :name         "Sales Trend"
                                              :description  "Quarterly sales data"})]
          (is (= "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."
                 (if (map? response)
                   (:message response)
                   response))))))))
