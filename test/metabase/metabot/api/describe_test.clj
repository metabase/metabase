(ns metabase.metabot.api.describe-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.openai-client :as openai-client]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(deftest summarize-card-test
  (testing "POST /api/metabot/describe/card"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:name "Orders"
                                       :dataset_query
                                       {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :orders)}}}]
        (let [fake-response {:title "Title" :description "Description"}
              json-response (json/encode fake-response)
              expected {:summary fake-response}]
          (testing "Card summarization works in the happy path"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content json-response}}]})]
              (is (= expected
                     (mt/user-http-request :rasta :post 200 "metabot/describe/card" card)))))
          (testing "We can handle json in markdown"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content
                                                  (format
                                                   "```json%s```"
                                                   json-response)}}]})]
              (is (= expected
                     (mt/user-http-request :rasta :post 200 "metabot/describe/card" card)))))
          (testing "We can't handle bad responses"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content
                                                  (format
                                                   "This is not a good json message -- %s"
                                                   json-response)}}]})]
              (is (= 500
                     (get-in
                      (mt/user-http-request :rasta :post 500 "metabot/describe/card" card)
                      [:data :status-code]))))))))))

(deftest summarize-dashboard-test
  (testing "POST /api/metabot/describe/dashboard/:id"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {card-id :id} {:name "Orders"
                                                :dataset_query
                                                {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (mt/id :orders)}}}
                     :model/Dashboard {dash-id :id} {:name "Dashboard"}
                     :model/DashboardCard {_ :id} {:dashboard_id dash-id
                                                   :card_id      card-id}]
        (let [url           (format "metabot/describe/dashboard/%s" dash-id)
              fake-response {:description "Description"
                             :keywords    "awesome, amazing"
                             :questions   "- What is this?"}
              json-response (json/encode fake-response)
              expected      {:summary {:description "Keywords: awesome, amazing\n\nDescription: Description\n\nQuestions:\n- What is this?"}}]
          (testing "Dashboard summarization works in the happy path"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content json-response}}]})]
              (is (= expected
                     (mt/user-http-request :rasta :post 200 url)))))
          (testing "We can handle json in markdown"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content (format "```json%s```" json-response)}}]})]
              (is (= expected
                     (mt/user-http-request :rasta :post 200 url)))))
          (testing "We can't handle bad responses"
            (with-redefs [openai-client/*create-chat-completion-endpoint*
                          (fn [_ _]
                            {:choices [{:message {:content
                                                  (format "This is not a good json message -- %s" json-response)}}]})]
              (is (= 500
                     (get-in
                      (mt/user-http-request :rasta :post 500 url)
                      [:data :status-code]))))))))))
