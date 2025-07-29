(ns metabase-enterprise.ai-entity-analysis.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-client]
   [metabase.test :as mt]))

(deftest analyze-chart-test
  (testing "POST /api/ee/ai-entity-analysis/analyze-chart"
    (mt/with-premium-features #{:ai-entity-analysis}
      (with-redefs [metabot-client/analyze-chart (constantly {:analysis "This chart shows a steady increase in sales over time, with a notable peak in Q4."})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/ai-entity-analysis/analyze-chart"
                                             {:image_base64 "base64encodedimage"
                                              :name "Sales Trend"
                                              :description "Quarterly sales data"
                                              :timeline_events [{:name "Product Launch"
                                                                 :description "New product line introduced"
                                                                 :timestamp "2023-04-15"}]})]
          (is (= {:summary "This chart shows a steady increase in sales over time, with a notable peak in Q4."}
                 response)))))))

(deftest premium-feature-test
  (testing "Endpoints require the :ai-entity-analysis premium feature"
    (mt/with-premium-features #{}
      (is (= {:status "error-premium-feature-not-available"}
             (select-keys (mt/user-http-request :rasta :post 402 "ee/ai-entity-analysis/analyze-chart"
                                                {:image_base64 "base64encodedimage"})
                          [:status]))))))
