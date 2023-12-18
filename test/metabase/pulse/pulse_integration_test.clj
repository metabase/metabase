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
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defmacro with-metadata-data-cards
  "Provide a fixture that includes:
  - A card with a custom column
  - A model with curated metadata (override on the Tax Rate type)
  - A question based on the above model"
  [[base-card-id model-card-id question-card-id] & body]
  `(mt/dataset ~'test-data
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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Consistent Date Formatting ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- sql-time-query
  "Generate a SQL query that produces N identical rows of data, each row containing a variety of different presentations
  of the input date string. The intent is to provide a wide variety for testing of different row data formats. The
  reason for the duplication of rows is that some logic (e.g. pulses) may not trigger if N is under a certain threshold
  (e.g. no attachments if less than 10 rows for an email)."
  [date-str n]
  (format
    "WITH T AS (SELECT CAST('%s' AS TIMESTAMP) AS example_timestamp),
          SAMPLE AS (SELECT T.example_timestamp                                   AS full_datetime_utc,
                            T.example_timestamp AT TIME ZONE 'US/Pacific'         AS full_datetime_pacific,
                            CAST(T.example_timestamp AS TIMESTAMP)                AS example_timestamp,
                            CAST(T.example_timestamp AS TIMESTAMP WITH TIME ZONE) AS example_timestamp_with_time_zone,
                            CAST(T.example_timestamp AS DATE)                     AS example_date,
                            CAST(T.example_timestamp AS TIME)                     AS example_time,
                            EXTRACT(YEAR FROM T.example_timestamp)                AS example_year,
                            EXTRACT(MONTH FROM T.example_timestamp)               AS example_month,
                            EXTRACT(DAY FROM T.example_timestamp)                 AS example_day,
                            EXTRACT(HOUR FROM T.example_timestamp)                AS example_hour,
                            EXTRACT(MINUTE FROM T.example_timestamp)              AS example_minute,
                            EXTRACT(SECOND FROM T.example_timestamp)              AS example_second
                     FROM T)
     SELECT *
     FROM SAMPLE
              CROSS JOIN
          generate_series(1, %s);"
    date-str n))

(defn- model-query [base-card-id]
  {:fields       [[:field "FULL_DATETIME_UTC" {:base-type :type/DateTimeWithLocalTZ}]
                  [:field "FULL_DATETIME_PACIFIC" {:base-type :type/DateTimeWithLocalTZ}]
                  [:field "EXAMPLE_TIMESTAMP" {:base-type :type/DateTime}]
                  [:field "EXAMPLE_TIMESTAMP_WITH_TIME_ZONE" {:base-type :type/DateTimeWithLocalTZ}]
                  [:field "EXAMPLE_DATE" {:base-type :type/Date}]
                  [:field "EXAMPLE_TIME" {:base-type :type/Time}]
                  [:field "EXAMPLE_YEAR" {:base-type :type/Integer}]
                  [:field "EXAMPLE_MONTH" {:base-type :type/Integer}]
                  [:field "EXAMPLE_DAY" {:base-type :type/Integer}]
                  [:field "EXAMPLE_HOUR" {:base-type :type/Integer}]
                  [:field "EXAMPLE_MINUTE" {:base-type :type/Integer}]
                  [:field "EXAMPLE_SECOND" {:base-type :type/Integer}]]
   :source-table (format "card__%s" base-card-id)})

(deftest consistent-date-formatting-test
  (mt/with-temporary-setting-values [custom-formatting nil]
    (let [q (sql-time-query "2023-12-11 15:30:45.123" 20)]
      (t2.with-temp/with-temp [Card {native-card-id :id} {:name          "NATIVE"
                                                          :dataset_query {:database (mt/id)
                                                                          :type     :native
                                                                          :native   {:query q}}}
                               Card {model-card-id  :id
                                     model-metadata :result_metadata} {:name          "MODEL"
                                                                       :dataset       true
                                                                       :dataset_query {:database (mt/id)
                                                                                       :type     :query
                                                                                       :query    (model-query native-card-id)}}
                               Card {meta-model-card-id :id} {:name                   "METAMODEL"
                                                              :dataset                true
                                                              :dataset_query          {:database (mt/id)
                                                                                       :type     :query
                                                                                       :query    {:source-table
                                                                                                  (format "card__%s" model-card-id)}}
                                                              :result_metadata        (mapv
                                                                                        (fn [{column-name :name :as col}]
                                                                                          (cond-> col
                                                                                            (= "EXAMPLE_TIMESTAMP_WITH_TIME_ZONE" column-name)
                                                                                            (assoc :settings {:date_separator "-"
                                                                                                              :date_style "YYYY/M/D"
                                                                                                              :time_style "HH:mm"})
                                                                                            (= "EXAMPLE_TIMESTAMP" column-name)
                                                                                            (assoc :settings {:time_enabled "seconds"})))
                                                                                        model-metadata)
                                                              :visualization_settings {:column_settings    {"[\"name\",\"FULL_DATETIME_UTC\"]"
                                                                                                            {:date_abbreviate true
                                                                                                             :time_enabled    "milliseconds"
                                                                                                             :time_style      "HH:mm"}
                                                                                                            "[\"name\",\"EXAMPLE_TIMESTAMP\"]"
                                                                                                            {:time_enabled    "milliseconds"}
                                                                                                            "[\"name\",\"EXAMPLE_TIME\"]"
                                                                                                            {:time_enabled    nil}
                                                                                                            "[\"name\",\"FULL_DATETIME_PACIFIC\"]"
                                                                                                            {:time_enabled    nil}}}}
                               Dashboard {dash-id :id} {:name "The Dashboard"}
                               DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                                      :card_id      native-card-id}
                               DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                                       :card_id      model-card-id}
                               DashboardCard {metamodel-dash-card-id :id} {:dashboard_id dash-id
                                                                           :card_id      meta-model-card-id}
                               Pulse {pulse-id :id
                                      :as      pulse} {:name "Consistent Time Formatting Pulse"}
                               PulseCard _ {:pulse_id          pulse-id
                                            :card_id           native-card-id
                                            :dashboard_card_id base-dash-card-id
                                            :include_csv       true}
                               PulseCard _ {:pulse_id          pulse-id
                                            :card_id           model-card-id
                                            :dashboard_card_id model-dash-card-id
                                            :include_csv       true}
                               PulseCard _ {:pulse_id          pulse-id
                                            :card_id           meta-model-card-id
                                            :dashboard_card_id metamodel-dash-card-id
                                            :include_csv       true}
                               PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                    :pulse_id     pulse-id
                                                                    :enabled      true}
                               PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                        :user_id          (mt/user->id :rasta)}]
        (let [attached-data     (run-pulse-and-return-attached-csv-data pulse)
              get-res           #(-> attached-data (get %)
                                     (update-vals first)
                                     (dissoc "X"))
              native-results    (get-res "NATIVE.csv")
              model-results     (get-res "MODEL.csv")
              metamodel-results (get-res "METAMODEL.csv")]
          ;; Note that these values are obtained by inspection since the UI formats are in the FE code.
          (testing "The default export formats conform to the default UI formats"
            (is (= {"FULL_DATETIME_UTC"                "December 11, 2023, 3:30 PM"
                    "FULL_DATETIME_PACIFIC"            "December 11, 2023, 3:30 PM"
                    "EXAMPLE_TIMESTAMP"                "December 11, 2023, 3:30 PM"
                    "EXAMPLE_TIMESTAMP_WITH_TIME_ZONE" "December 11, 2023, 3:30 PM"
                    "EXAMPLE_DATE"                     "December 11, 2023"
                    "EXAMPLE_TIME"                     "3:30 PM"
                    ;; NOTE -- We don't have a type in our type system for year so this is just an integer.
                    ;; It might be worth looking into fixing this so that it displays without a comma
                    "EXAMPLE_YEAR"                     "2,023"
                    "EXAMPLE_MONTH"                    "12"
                    "EXAMPLE_DAY"                      "11"
                    "EXAMPLE_HOUR"                     "15"
                    "EXAMPLE_MINUTE"                   "30"
                    "EXAMPLE_SECOND"                   "45"}
                   native-results)))
          (testing "An exported model retains the base format, but does use display names for column names."
            (is (= {"Full Datetime Utc"                "December 11, 2023, 3:30 PM"
                    "Full Datetime Pacific"            "December 11, 2023, 3:30 PM"
                    "Example Timestamp"                "December 11, 2023, 3:30 PM"
                    "Example Timestamp With Time Zone" "December 11, 2023, 3:30 PM"
                    "Example Date"                     "December 11, 2023"
                    "Example Time"                     "3:30 PM"
                    "Example Year"                     "2,023"
                    "Example Month"                    "12"
                    "Example Day"                      "11"
                    "Example Hour"                     "15"
                    "Example Minute"                   "30"
                    "Example Second"                   "45"}
                   model-results)))
          (testing "Visualization settings are applied"
            (is (= "Dec 11, 2023, 15:30:45.123"
                   (metamodel-results "Full Datetime Utc"))))
          (testing "Custom column metadata settings are applied"
            (is (= "2023-12-11, 15:30"
                   (metamodel-results "Example Timestamp With Time Zone"))))
          (testing "Custom column settings metadata takes precedence over visualization settings"
            (is (= "December 11, 2023, 3:30:45 PM"
                   (metamodel-results "Example Timestamp"))))
          (testing "Setting time-enabled to nil for a date time column results in only showing the date"
            (is (= "December 11, 2023"
                   (metamodel-results "Full Datetime Pacific"))))
          (testing "Setting time-enabled to nil for a time column just returns an empty string"
            (is (= ""
                   (metamodel-results "Example Time")))))))))
