(ns metabase.pulse.pulse-integration-test
  "Tests that demonstrate the full capability of static-viz as distributed via pulses.

  These tests should build content then mock out distrubution by usual channels (e.g. email) and check the results of
  the distributed content for correctness."
  (:require
    [clojure.string :as str]
    [clojure.test :refer :all]
    [hickory.core :as hik]
    [hickory.select :as hik.s]
    [metabase.email :as email]
    [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard PulseChannel PulseChannelRecipient]]
    [metabase.pulse]
    [metabase.test :as mt]))

(deftest result-metadata-preservation-in-html-static-viz-test
  (testing "Results metadata applied to a model or query based on a model should be used in the HTML rendering of the pulse email."
    (mt/dataset sample-dataset
      (mt/with-temp [Card {base-card-id :id} {:name          "Base question - no special metadata"
                                              :dataset_query {:database (mt/id)
                                                              :type     :query
                                                              :query    {:source-table (mt/id :orders)
                                                                         :expressions  {"Tax Rate" [:/
                                                                                                    [:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                                    [:field (mt/id :orders :total) {:base-type :type/Float}]]},
                                                                         :fields       [[:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                                                        [:field (mt/id :orders :total) {:base-type :type/Float}]
                                                                                        [:expression "Tax Rate"]]
                                                                         :limit        10}}}
                     Card {model-card-id :id} {:name            "Model with percent semantic type"
                                               :dataset         true
                                               :dataset_query   {:type     :query
                                                                 :database (mt/id)
                                                                 :query    {:source-table (format "card__%s" base-card-id)}}
                                               :result_metadata [{:name         "TAX"
                                                                  :display_name "Tax"
                                                                  :base_type    :type/Float}
                                                                 {:name         "TOTAL"
                                                                  :display_name "Total"
                                                                  :base_type    :type/Float}
                                                                 {:name          "Tax Rate"
                                                                  :display_name  "Tax Rate"
                                                                  :base_type     :type/Float
                                                                  :semantic_type :type/Percentage
                                                                  :field_ref     [:field "Tax Rate" {:base-type :type/Float}]}]}
                     Card {question-card-id :id} {:name          "Query based on model"
                                                  :dataset_query {:type     :query
                                                                  :database (mt/id)
                                                                  :query    {:source-table (format "card__%s" model-card-id)}}}
                     Dashboard {dash-id :id} {:name "just dash"}
                     DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                            :card_id      base-card-id}
                     DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                             :card_id      model-card-id}
                     DashboardCard {question-dash-card-id :id} {:dashboard_id dash-id
                                                                :card_id      question-card-id}
                     Pulse {pulse-id :id
                            :as      pulse} {:name         "Test Pulse"
                                             :dashboard_id dash-id}
                     PulseCard _ {:pulse_id          pulse-id
                                  :card_id           base-card-id
                                  :dashboard_card_id base-dash-card-id}
                     PulseCard _ {:pulse_id          pulse-id
                                  :card_id           model-card-id
                                  :dashboard_card_id model-dash-card-id}
                     PulseCard _ {:pulse_id          pulse-id
                                  :card_id           question-card-id
                                  :dashboard_card_id question-dash-card-id}
                     PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                          :pulse_id     pulse-id
                                                          :enabled      true}
                     PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                              :user_id          (mt/user->id :rasta)}]
        (mt/with-fake-inbox
          (with-redefs [email/bcc-enabled? (constantly false)]
            (mt/with-test-user nil
              (metabase.pulse/send-pulse! pulse)))
          ;; NOTE -- (get-in @mt/inbox ["rasta@metabase.com"]) produces the full email to rasta.
          ;; This test checks the HTML output for formatting only. A TODO is to add tests to check the attached csv and
          ;; any other result form for consistent formatting as well. As of 2023-12-01, all 2 csvs in this attachment
          ;; are not formatted as percentages. We need to add an issue and fix this.
          (let [html-body   (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])
                doc         (-> html-body hik/parse hik/as-hickory)
                data-tables (hik.s/select
                              (hik.s/class "pulse-body")
                              doc)
                [base-data-row
                 model-data-row
                 question-data-row] (map
                                      (fn [data-table]
                                        (->> (hik.s/select
                                               (hik.s/child
                                                 (hik.s/tag :tbody)
                                                 (hik.s/tag :tr)
                                                 hik.s/last-child)
                                               data-table)
                                             (map (comp first :content))))
                                      data-tables)]
            (testing "The data from the first question is just numbers."
              (is (every? (partial re-matches #"\d+\.\d+") base-data-row)))
            (testing "The data from the second question (a model) is percent formatted"
              (is (every? #(str/ends-with? % "%") model-data-row)))
            (testing "The data from the last question (based on the above model) is percent formatted"
              (is (every? #(str/ends-with? % "%") question-data-row)))))))))
