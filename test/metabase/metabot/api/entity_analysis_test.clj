(ns metabase.metabot.api.entity-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.core :as metabot]
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
