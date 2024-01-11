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

(defn- run-pulse-and-return-scalars
  "Simulate sending the pulse email, get the html body of the response and return the scalar value of the card."
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [email/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (metabase.pulse/send-pulse! pulse)))
    (let [html-body   (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])
          doc         (-> html-body hik/parse hik/as-hickory)
          data-tables (hik.s/select
                       (hik.s/class "pulse-body")
                       doc)]
      (mapcat
       (fn [data-table]
         (->> (hik.s/select
               hik.s/first-child
               data-table)
              (map (comp first :content))))
       data-tables))))

(deftest number-viz-shows-correct-value
  (testing "Static Viz. Render of 'Number' Visualization shows the correct column's first value #32362."
    (mt/dataset sample-dataset
      (let [ ;; test card 1 'narrows' the query to a single column (the "TAX" field)
            test-card1 {:visualization_settings {:scalar.field "TAX"}
                        :display                :scalar
                        :dataset_query          {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (mt/id :orders)
                                                            :fields       [[:field (mt/id :orders :tax) {:base-type :type/Float}]]}}}
            ;; test card 2's query returns all cols/rows of the table, but still has 'Number' viz settings `{:scalar.field "TAX"}`
            test-card2 {:visualization_settings {:scalar.field "TAX"}
                        :display                :scalar
                        :dataset_query          {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (mt/id :orders)}}}]
        (mt/with-temp [Card          {card-id1 :id} test-card1
                       Card          {card-id2 :id} test-card2
                       Dashboard     {dash-id :id} {:name "just dash"}
                       DashboardCard {dash-card-id1 :id} {:dashboard_id dash-id
                                                          :card_id      card-id1}
                       DashboardCard {dash-card-id2 :id} {:dashboard_id dash-id
                                                          :card_id      card-id2}
                       Pulse         {pulse-id :id :as pulse} {:name         "Test Pulse"
                                                               :dashboard_id dash-id}
                       PulseCard             _             {:pulse_id          pulse-id
                                                            :card_id           card-id1
                                                            :dashboard_card_id dash-card-id1}
                       PulseCard             _             {:pulse_id          pulse-id
                                                            :card_id           card-id2
                                                            :dashboard_card_id dash-card-id2}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          ;; First value is the scalar returned from card1 (specified "TAX" field directly in the query)
          ;; Second value is the scalar returned from card2 (scalar field specified only in viz-settings, not the query)
          (is (= ["2.07" "2.07"]
                 (run-pulse-and-return-scalars pulse))))))))

(defn- run-pulse-and-return-data-tables
  "Run the pulse and return the sequence of inlined html tables as data. Empty tables will be [].
  If not pulse is sent, return `nil`."
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [email/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (metabase.pulse/send-pulse! pulse)))
    (when-some [html-body (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])]
      (let [doc         (-> html-body hik/parse hik/as-hickory)
            data-tables (hik.s/select
                          (hik.s/class "pulse-body")
                          doc)]
        (mapv
          (fn [data-table]
            (->> (hik.s/select
                   (hik.s/child
                     (hik.s/tag :tbody)
                     (hik.s/tag :tr))
                   data-table)
                 (mapv (comp (partial mapv (comp first :content)) :content))))
          data-tables)))))

(defmacro with-skip-if-empty-pulse-result
  "Provide a fixture that runs body using the provided pulse results (symbol), the value of `:skip_if_empty` for the
  pulse, and the queries for two cards. This enables a variety of cases to test the behavior of `:skip_if_empty` based
  on the presence or absence of card data."
  [[result skip-if-empty? query1 query2] & body]
  `(mt/with-temp [Card {~'base-card-id :id} {:name          "Card1"
                                             :dataset_query {:database (mt/id)
                                                             :type     :query
                                                             :query    ~query1}}
                  Card {~'empty-card-id :id} {:name          "Card2"
                                              :dataset_query {:database (mt/id)
                                                              :type     :query
                                                              :query    ~query2}}
                  Dashboard {~'dash-id :id} {:name "The Dashboard"}
                  DashboardCard {~'base-dash-card-id :id} {:dashboard_id ~'dash-id
                                                           :card_id      ~'base-card-id}
                  DashboardCard {~'empty-dash-card-id :id} {:dashboard_id ~'dash-id
                                                            :card_id      ~'empty-card-id}
                  Pulse {~'pulse-id :id :as ~'pulse} {:name          "Only populated pulse"
                                                      :dashboard_id  ~'dash-id
                                                      :skip_if_empty ~skip-if-empty?}
                  PulseCard ~'_ {:pulse_id          ~'pulse-id
                                 :card_id           ~'base-card-id
                                 :dashboard_card_id ~'base-dash-card-id
                                 :include_csv       true}
                  PulseCard ~'_ {:pulse_id          ~'pulse-id
                                 :card_id           ~'empty-card-id
                                 :dashboard_card_id ~'empty-dash-card-id
                                 :include_csv       true}
                  PulseChannel {~'pulse-channel-id :id} {:channel_type :email
                                                         :pulse_id     ~'pulse-id
                                                         :enabled      true}
                  PulseChannelRecipient ~'_ {:pulse_channel_id ~'pulse-channel-id
                                             :user_id          (mt/user->id :rasta)}]
     (let [~result (run-pulse-and-return-data-tables ~'pulse)]
       ~@body)))

(deftest skip-if-empty-test
  #_{:clj-kondo/ignore [:unresolved-symbol]}
  (testing "Only send non-empty cards when 'Don't send if there aren't results is enabled' (#34777)"
    (mt/dataset sample-dataset
      (let [query       {:source-table (mt/id :orders)
                         :fields       [[:field (mt/id :orders :id) {:base-type :type/BigInteger}]
                                        [:field (mt/id :orders :tax) {:base-type :type/Float}]]
                         :limit        2}
            query2      (merge query {:limit 3})
            empty-query (merge query
                               {:filter [:= [:field (mt/id :orders :tax) {:base-type :type/Float}] -1]})]
        (testing "Cases for when 'Don't send if there aren't results is enabled' is false"
          (let [skip-if-empty? false]
            (testing "Everything has results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? query query2]
                (testing "Show all the data"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]
                          [["1" "2.07"] ["2" "6.1"] ["3" "2.9"]]]
                         result)))))
            (testing "Not everything has results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? query empty-query]
                (testing "The second table is empty since there are no results"
                  (is (= [[["1" "2.07"] ["2" "6.1"]] []] result)))))
            (testing "No results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? empty-query empty-query]
                (testing "We send the email anyways, despite everything being empty due to no results"
                  (is (= [[] []] result)))))))
        (testing "Cases for when 'Don't send if there aren't results is enabled' is true"
          (let [skip-if-empty? true]
            (testing "Everything has results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? query query2]
                (testing "When everything has results, we see everything"
                  (is (= 2 (count result))))
                (testing "Show all the data"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]
                          [["1" "2.07"] ["2" "6.1"] ["3" "2.9"]]]
                         result)))))
            (testing "Not everything has results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? query empty-query]
                (testing "We should only see a single data table in the result"
                  (is (= 1 (count result))))
                (testing "The single result should contain the card with data in it"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]] result)))))
            (testing "No results"
              (with-skip-if-empty-pulse-result [result skip-if-empty? empty-query empty-query]
                (testing "Don't send a pulse if no results at all"
                  (is (nil? result)))))))))))
