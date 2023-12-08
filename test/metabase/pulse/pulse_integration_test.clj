(ns metabase.pulse.pulse-integration-test
  "Tests that demonstrate the full capability of static-viz as distributed via pulses.

  These tests should build content then mock out distrubution by usual channels (e.g. email) and check the results of
  the distributed content for correctness."
  (:require
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [hickory.core :as hik]
   [hickory.select :as hik.s]
   [metabase.email :as email]
   [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard PulseChannel PulseChannelRecipient]]
   [metabase.pulse]
   [metabase.test :as mt]))

(defmacro with-metadata-data-cards
  "Provide a fixture that includes:
  - A card with a custom column
  - A model with curated metadata (override on the Tax Rate type)
  - A question based on the above model"
  [[base-card-id model-card-id question-card-id] & body]
  `(mt/dataset ~'sample-dataset
     (mt/with-temp [Card {~base-card-id :id} {:name          "Base question - no special metadata"
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
                    Card {~model-card-id :id} {:name            "Model with percent semantic type"
                                               :dataset         true
                                               :dataset_query   {:type     :query
                                                                 :database (mt/id)
                                                                 :query    {:source-table (format "card__%s" ~'base-card-id)}}
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
                    Card {~question-card-id :id} {:name          "Query based on model"
                                                  :dataset_query {:type     :query
                                                                  :database (mt/id)
                                                                  :query    {:source-table (format "card__%s" ~'model-card-id)}}}]
       ~@body)))

(defn- run-pulse-and-return-last-data-columns
  "Simulate sending the pulse email, get the html body of the response, then return the last columns of each pulse body
  element. In our test cases that's the Tax Rate column."
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [email/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (metabase.pulse/send-pulse! pulse)))
    (let [html-body  (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])
          doc        (-> html-body hik/parse hik/as-hickory)
          data-tables (hik.s/select
                        (hik.s/class "pulse-body")
                        doc)]
      (map
        (fn [data-table]
          (->> (hik.s/select
                 (hik.s/child
                   (hik.s/tag :tbody)
                   (hik.s/tag :tr)
                   hik.s/last-child)
                 data-table)
               (map (comp first :content))))
        data-tables))))

(def ^:private all-pct-2d?
  "Is every element in the sequence percent formatted with 2 significant digits?"
  (partial every? (partial re-matches #"\d+\.\d{2}%")))

(def ^:private all-float?
  "Is every element in the sequence a float with leading digits, a period, and trailing digits"
  (partial every? (partial re-matches #"\d+\.\d+")))

(deftest result-metadata-preservation-in-html-static-viz-for-dashboard-test
  (testing "In a dashboard, results metadata applied to a model or query based on a model should be used in the HTML rendering of the pulse email."
    #_{:clj-kondo/ignore [:unresolved-symbol]}
    (with-metadata-data-cards [base-card-id model-card-id question-card-id]
      (mt/with-temp [Dashboard {dash-id :id} {:name "just dash"}
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
        (let [[base-data-row
               model-data-row
               question-data-row] (run-pulse-and-return-last-data-columns pulse)]
          (testing "The data from the first question is just numbers."
            (is (all-float? base-data-row)))
          (testing "The data from the second question (a model) is percent formatted"
            (is (all-pct-2d? model-data-row)))
          (testing "The data from the last question (based on the above model) is percent formatted"
            (is (all-pct-2d? question-data-row))))))))

(deftest simple-model-with-metadata-no-dashboard-in-html-static-viz-test
  (testing "Cards with metadata sent as pulses should preserve metadata in html formatting (#36323)"
    ;; NOTE: We run this as three tests vs. creating a single pulse with 3 images due to ordering issues. The reason for
    ;; this is that it appears that the image ordering when running without a dashboard is indeterminate. In general,
    ;; you subscribe to either a dashboard or a card anyway, so it probably isn't a current real world use case to
    ;; combine all 3 cards into a single pulse with no dashboard.
    (with-metadata-data-cards [base-card-id model-card-id question-card-id]
      (testing "The data from the first question is just numbers."
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  base-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (is (all-float? (first (run-pulse-and-return-last-data-columns pulse))))))
      (testing "The data from the second question (a model) is percent formatted"
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  model-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (is (all-pct-2d? (first (run-pulse-and-return-last-data-columns pulse))))))
      (testing "The data from the last question (based on a a model) is percent formatted"
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  question-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (is (all-pct-2d? (first (run-pulse-and-return-last-data-columns pulse)))))))))

(defn- run-pulse-and-return-attached-csv-data
  "Simulate sending the pulse email, get the attached text/csv content, and parse into a map of
  attachment name -> column name -> column data"
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [email/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (metabase.pulse/send-pulse! pulse)))
    (->>
      (get-in @mt/inbox ["rasta@metabase.com" 0 :body])
      (keep
        (fn [{:keys [type content-type file-name content]}]
          (when (and
                  (= :attachment type)
                  (= "text/csv" content-type))
            [file-name
             (let [[h & r] (csv/read-csv (slurp content))]
               (zipmap h (apply mapv vector r)))])))
      (into {}))))

(deftest apply-formatting-in-csv-dashboard-test
  (testing "An exported dashboard should preserve the formatting specified in the column metadata (#36320)"
    (with-metadata-data-cards [base-card-id model-card-id question-card-id]
      (mt/with-temp [Dashboard {dash-id :id} {:name "just dash"}
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
        (let [parsed-data (run-pulse-and-return-attached-csv-data pulse)]
          (testing "The base model has no special formatting"
            (is (all-float? (get-in parsed-data ["Base question - no special metadata.csv" "Tax Rate"]))))
          (testing "The model with metadata formats the Tax Rate column with the user-defined semantic type"
            (is (all-pct-2d? (get-in parsed-data ["Model with percent semantic type.csv" "Tax Rate"]))))
          (testing "The query based on the model uses the model's semantic typ information for formatting"
            (is (all-pct-2d? (get-in parsed-data ["Query based on model.csv" "Tax Rate"])))))))))

(deftest apply-formatting-in-csv-no-dashboard-test
  (testing "Exported cards should preserve the formatting specified in their column metadata (#36320)"
    (with-metadata-data-cards [base-card-id model-card-id question-card-id]
      (testing "The attached data from the first question is just numbers."
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  base-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data pulse)]
            (is (all-float? (get-in parsed-data ["Base question - no special metadata.csv" "Tax Rate"]))))))
      (testing "The attached data from the second question (a model) is percent formatted"
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  model-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data pulse)]
            (is (all-pct-2d? (get-in parsed-data ["Model with percent semantic type.csv" "Tax Rate"]))))))
      (testing "The attached data from the last question (based on a a model) is percent formatted"
        (mt/with-temp [Pulse {pulse-id :id
                              :as      pulse} {:name "Test Pulse"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  question-card-id}
                       PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     pulse-id
                                                            :enabled      true}
                       PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data pulse)]
            (is (all-pct-2d? (get-in parsed-data ["Query based on model.csv" "Tax Rate"])))))))))
