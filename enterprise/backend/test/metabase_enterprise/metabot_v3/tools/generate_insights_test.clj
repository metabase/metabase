(ns metabase-enterprise.metabot-v3.tools.generate-insights-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel generate-insights-test
  (testing "Metrics"
    (let [results-url "/auto/dashboard/question/42"]
      (is (= {:output results-url
              :reactions [{:type :metabot.reaction/redirect :url results-url}]}
             (metabot-v3.tools.interface/*invoke-tool*
              :metabot.tool/generate-insights
              {:for {:metric_id 42}}
              {})))))
  (testing "Reports"
    (let [results-url "/auto/dashboard/question/42"]
      (is (= {:output results-url
              :reactions [{:type :metabot.reaction/redirect :url results-url}]}
             (metabot-v3.tools.interface/*invoke-tool*
              :metabot.tool/generate-insights
              {:for {:report_id 42}}
              {})))))
  (testing "Tables"
    (let [results-url "/auto/dashboard/table/42"]
      (are [id] (= {:output results-url
                    :reactions [{:type :metabot.reaction/redirect :url results-url}]}
                   (metabot-v3.tools.interface/*invoke-tool*
                    :metabot.tool/generate-insights
                    {:for {:table_id id}}
                    {}))
        42
        "42"))
    (let [results-url "/auto/dashboard/table/card__42"]
      (is (= {:output results-url
              :reactions [{:type :metabot.reaction/redirect :url results-url}]}
             (metabot-v3.tools.interface/*invoke-tool*
              :metabot.tool/generate-insights
              {:for {:table_id "card__42"}}
              {}))))
    (are [id] (= {:output "Invalid table_id"}
                 (metabot-v3.tools.interface/*invoke-tool*
                  :metabot.tool/generate-insights
                  {:for {:table_id id}}
                  {}))
      :42
      "table_name"))
  (testing "Queries"
    (let [query-id (u/generate-nano-id)
          query {:database 1
                 :type :query
                 :query {:source-table 3
                         :breakout [[:field 13 {:base-type :type/DateTime, :temporal-unit :month}]]
                         :aggregation [[:metric 123]]
                         :filter [:=
                                  [:get-year [:field 13 {:base-type :type/DateTime, :temporal-unit :month}]]
                                  2024]}}
          entity-id (-> query json/encode .getBytes codecs/bytes->b64-str)
          results-url (str "/auto/dashboard/adhoc/" entity-id)]
      (is (= {:output results-url
              :reactions [{:type :metabot.reaction/redirect :url results-url}]}
             (metabot-v3.tools.interface/*invoke-tool*
              :metabot.tool/generate-insights
              {:for {:query_id query-id}}
              {:history [{:role :tool
                          :tool-call-id "some tool call ID"
                          :structured-content {:type :query
                                               :query_id query-id
                                               :query query}}]}))))))
