(ns metabase-enterprise.metabot-v3.tools.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric :as metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase.test :as mt]))

(defn- ai-session-token
  ([] (ai-session-token :rasta))
  ([user]
   (-> user mt/user->id (#'metabot-v3.tools.api/get-ai-service-token))))

(deftest create-dashboard-subscription-test
  (let [tool-requests (atom [])
        conversation-id (str (random-uuid))
        output (str (random-uuid))
        ai-token (ai-session-token)]
    (with-redefs [metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription
                  (fn [arguments]
                    (swap! tool-requests conj arguments)
                    {:output output})]
      (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/create-dashboard-subscription"
                                           {:request-options {:headers {"x-metabase-session" ai-token}}}
                                           {:arguments       {:dashboard_id 1
                                                              :email        "user@example.com"
                                                              :schedule     {:frequency "hourly"}}
                                            :conversation_id conversation-id})]
        (is (=? {:output output
                 :conversation_id conversation-id}
                response))))))

(deftest filter-records-test
  (doseq [data-source [{:query {:database 1}, :query_id "query ID"}
                       {:query {:database 1}}
                       {:report_id 1}
                       {:table_id "1"}]]
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.filters/filter-records
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output output})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/filter-records"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:data_source data-source
                                                                :filters     [{:field_id  "q234234/1"
                                                                               :operation "is-not-null"}]}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output output
                   :conversation_id conversation-id}
                  response)))))))

(deftest find-metric-test
  (let [tool-requests (atom [])
        conversation-id (str (random-uuid))
        output (str (random-uuid))
        ai-token (ai-session-token)]
    (with-redefs [metabot-v3.tools.find-metric/find-metric
                  (fn [arguments]
                    (swap! tool-requests conj arguments)
                    {:structured-output output})]
      (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/find-metric"
                                           {:request-options {:headers {"x-metabase-session" ai-token}}}
                                           {:arguments       {:message "search text"}
                                            :conversation_id conversation-id})]
        (is (=? {:structured_output output
                 :conversation_id conversation-id}
                response))))))

(deftest find-outliers-test
  (doseq [data-source [{:query {:database 1}, :query_id "query ID", :result_field_id "q1233/2"}
                       {:query {:database 1}, :result_field_id "q1233/2"}
                       {:metric_id 1}
                       {:report_id 1, :result_field_id "c131/3"}
                       {:table_id "card__1", :result_field_id "t42/7"}]]
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.find-outliers/find-outliers
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:structured-output output})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/find-outliers"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:data_source data-source}
                                              :conversation_id conversation-id})]
          (is (=? {:structured_output output
                   :conversation_id conversation-id}
                  response)))))))

(deftest generate-insights-test
  (doseq [data-source [{:query {:database 1}}
                       {:metric_id 1}
                       {:report_id 1}
                       {:table_id "card__1"}]]
    (let [tool-requests (atom [])
          conversation-id (str (random-uuid))
          output (str (random-uuid))
          redirect-url "https://example.com/redirect-target"
          ai-token (ai-session-token)]
      (with-redefs [metabot-v3.tools.generate-insights/generate-insights
                    (fn [arguments]
                      (swap! tool-requests conj arguments)
                      {:output output
                       :reactions [{:type :metabot.reaction/redirect
                                    :url  redirect-url}]})]
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/generate-insights"
                                             {:request-options {:headers {"x-metabase-session" ai-token}}}
                                             {:arguments       {:for data-source}
                                              :conversation_id conversation-id})]
          (is (=? {:output output
                   :reactions [{:type "metabot.reaction/redirect"
                                :url  redirect-url}]
                   :conversation_id conversation-id}
                  response)))))))

(deftest query-metric-test
  (let [tool-requests (atom [])
        conversation-id (str (random-uuid))
        output (str (random-uuid))
        ai-token (ai-session-token)]
    (with-redefs [metabot-v3.tools.filters/query-metric
                  (fn [arguments]
                    (swap! tool-requests conj arguments)
                    {:structured-output output})]
      (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-tools/query-metric"
                                           {:request-options {:headers {"x-metabase-session" ai-token}}}
                                           {:arguments       {:metric_id 1
                                                              :filters   [{:field_id  "c2/7"
                                                                           :operation "number-greater-than"
                                                                           :value     50}]
                                                              :group_by  [{:field_id "c2/2"
                                                                           :field_granularity "week"}
                                                                          {:field_id "c2/3"
                                                                           :field_granularity "day"}]}
                                            :conversation_id conversation-id})]
        (is (=? {:structured_output output
                 :conversation_id conversation-id}
                response))))))
