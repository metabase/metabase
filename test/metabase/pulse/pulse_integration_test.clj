(ns metabase.pulse.pulse-integration-test
  "Tests that demonstrate the full capability of static-viz as distributed via pulses.

  These tests should build content then mock out distrubution by usual channels (e.g. email) and check the results of
  the distributed content for correctness."
  (:require
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hickory.core :as hik]
   [hickory.select :as hik.s]
   [metabase.channel.settings :as channel.settings]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (notification.tu/with-send-notification-sync
                        (thunk))))

(defmacro with-metadata-data-cards
  "Provide a fixture that includes:
  - A card with a custom column
  - A model with curated metadata (override on the Tax Rate type)
  - A question based on the above model"
  [[base-card-id model-card-id question-card-id] & body]
  `(mt/dataset ~'test-data
     (mt/with-temp [:model/Card {~base-card-id :id} {:name          "Base question - no special metadata"
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
                    :model/Card {~model-card-id :id} (-> (mt/card-with-source-metadata-for-query
                                                          {:type     :query
                                                           :database (mt/id)
                                                           :query    {:source-table (format "card__%s" ~base-card-id)}})
                                                         (assoc :name "Model with percent semantic type"
                                                                :type :model)
                                                         (update :result_metadata
                                                                 ~(fn [metadata]
                                                                    (mapv #(cond-> %
                                                                             (= (:name %) "Tax Rate")
                                                                             (assoc :semantic_type :type/Percentage))
                                                                          metadata))))
                    :model/Card {~question-card-id :id} {:name          "Query based on model"
                                                         :dataset_query {:type     :query
                                                                         :database (mt/id)
                                                                         :query    {:source-table (format "card__%s" ~model-card-id)}}}]
       ~@body)))

(defn- run-pulse-and-return-last-data-columns!
  "Simulate sending the pulse email, get the html body of the response, then return the last columns of each pulse body
  element. In our test cases that's the Tax Rate column."
  [pulse]
  (let [channel-messages (pulse.test-util/with-captured-channel-send-messages!
                           (with-redefs [channel.settings/bcc-enabled? (constantly false)]
                             (mt/with-test-user nil
                               (pulse.send/send-pulse! pulse))))
        html-body  (-> channel-messages :channel/email first :message first :content)
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
     data-tables)))

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
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "just dash"}
                     :model/DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                                   :card_id      base-card-id}
                     :model/DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                                    :card_id      model-card-id}
                     :model/DashboardCard {question-dash-card-id :id} {:dashboard_id dash-id
                                                                       :card_id      question-card-id}
                     :model/Pulse {pulse-id :id
                                   :as      pulse} {:name         "Test Pulse"
                                                    :dashboard_id dash-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           base-card-id
                                         :dashboard_card_id base-dash-card-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           model-card-id
                                         :dashboard_card_id model-dash-card-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           question-card-id
                                         :dashboard_card_id question-dash-card-id}
                     :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                 :pulse_id     pulse-id
                                                                 :enabled      true}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                     :user_id          (mt/user->id :rasta)}]
        (let [[base-data-row
               model-data-row
               question-data-row] (run-pulse-and-return-last-data-columns! pulse)]
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
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name            "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  base-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (is (all-float? (first (run-pulse-and-return-last-data-columns! pulse))))))
      (testing "The data from the second question (a model) is percent formatted"
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  model-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (is (all-pct-2d? (first (run-pulse-and-return-last-data-columns! pulse))))))
      (testing "The data from the last question (based on a a model) is percent formatted"
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  question-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (is (all-pct-2d? (first (run-pulse-and-return-last-data-columns! pulse)))))))))

(defn- strip-timestamp
  "Remove the timestamp portion of attachment filenames.
  This is useful for creating stable filename keys in tests.
  For example, see `run-pulse-and-return-attached-csv-data` below.

  Eg. test_card_2024-03-05T22:30:24.077306Z.csv -> test_card.csv"
  [fname]
  (let [ext (last (str/split fname #"\."))
        name-parts (butlast (str/split fname #"_"))]
    (format "%s.%s" (str/join "_" name-parts) ext)))

(defn- run-pulse-and-return-attached-csv-data!
  "Simulate sending the pulse email, get the attached text/csv content, and parse into a map of
  attachment name -> column name -> column data"
  [pulse]
  (with-redefs [channel.settings/bcc-enabled? (constantly false)]
    (->> (mt/with-test-user nil
           (pulse.test-util/with-captured-channel-send-messages!
             (pulse.send/send-pulse! pulse)))
         :channel/email
         first
         :message
         (keep
          (fn [{:keys [type content-type file-name content]}]
            (when (and
                   (= :attachment type)
                   (= "text/csv" content-type))
              [(strip-timestamp file-name)
               (let [[h & r] (csv/read-csv (slurp content))]
                 (zipmap h (apply mapv vector r)))])))
         (into {}))))

(deftest apply-formatting-in-csv-dashboard-test
  (testing "An exported dashboard should preserve the formatting specified in the column metadata (#36320)"
    (with-metadata-data-cards [base-card-id model-card-id question-card-id]
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "just dash"}
                     :model/DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                                   :card_id      base-card-id}
                     :model/DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                                    :card_id      model-card-id}
                     :model/DashboardCard {question-dash-card-id :id} {:dashboard_id dash-id
                                                                       :card_id      question-card-id}
                     :model/Pulse {pulse-id :id
                                   :as      pulse} {:name         "Test Pulse"
                                                    :dashboard_id dash-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           base-card-id
                                         :dashboard_card_id base-dash-card-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           model-card-id
                                         :dashboard_card_id model-dash-card-id}
                     :model/PulseCard _ {:pulse_id          pulse-id
                                         :card_id           question-card-id
                                         :dashboard_card_id question-dash-card-id}
                     :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                 :pulse_id     pulse-id
                                                                 :enabled      true}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                     :user_id          (mt/user->id :rasta)}]
        (let [parsed-data (run-pulse-and-return-attached-csv-data! pulse)]
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
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  base-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data! pulse)]
            (is (all-float? (get-in parsed-data ["Base question - no special metadata.csv" "Tax Rate"]))))))
      (testing "The attached data from the second question (a model) is percent formatted"
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  model-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data! pulse)]
            (is (all-pct-2d? (get-in parsed-data ["Model with percent semantic type.csv" "Tax Rate"]))))))
      (testing "The attached data from the last question (based on a a model) is percent formatted"
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Test Pulse"
                                                      :alert_condition "rows"}
                       :model/PulseCard _ {:pulse_id pulse-id
                                           :card_id  question-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (let [parsed-data (run-pulse-and-return-attached-csv-data! pulse)]
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
          \"SAMPLE\" AS (SELECT T.example_timestamp                                   AS full_datetime_utc,
                            T.example_timestamp AT TIME ZONE 'US/Pacific'         AS full_datetime_pacific,
                            CAST(T.example_timestamp AS TIMESTAMP)                AS example_timestamp,
                            CAST(T.example_timestamp AS TIMESTAMP WITH TIME ZONE) AS example_timestamp_with_time_zone,
                            CAST(T.example_timestamp AS DATE)                     AS example_date,
                            CAST(T.example_timestamp AS TIME)                     AS example_time,
                            EXTRACT(YEAR FROM T.example_timestamp)                AS example_year,
                            EXTRACT(MONTH FROM T.example_timestamp)               AS example_month,
                            EXTRACT(DAY FROM T.example_timestamp)                 AS example_day,
                            EXTRACT(WEEK FROM T.example_timestamp)                AS example_week_number,
                            T.example_timestamp                                   AS example_week,
                            EXTRACT(HOUR FROM T.example_timestamp)                AS example_hour,
                            EXTRACT(MINUTE FROM T.example_timestamp)              AS example_minute,
                            EXTRACT(SECOND FROM T.example_timestamp)              AS example_second
                     FROM T)
     SELECT *
     FROM \"SAMPLE\"
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
                  [:field "EXAMPLE_WEEK_NUMBER" {:base-type :type/Integer}]
                  [:field "EXAMPLE_WEEK" {:base-type :type/DateTime, :temporal-unit :week}]
                  [:field "EXAMPLE_HOUR" {:base-type :type/Integer}]
                  [:field "EXAMPLE_MINUTE" {:base-type :type/Integer}]
                  [:field "EXAMPLE_SECOND" {:base-type :type/Integer}]]
   :source-table (format "card__%s" base-card-id)})

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest consistent-date-formatting-test
  (mt/with-temporary-setting-values [custom-formatting nil]
    (let [q (sql-time-query "2023-12-11 15:30:45.123" 20)]
      (letfn [(model-metadata-fn [col]
                (assoc col :display_name (u.humanization/name->human-readable-name :simple (:name col))))
              (metamodel-metadata-fn [{column-name :name :as col}]
                (let [settings (case column-name
                                 "EXAMPLE_TIMESTAMP_WITH_TIME_ZONE"
                                 {:date_separator "-"
                                  :date_style     "YYYY/M/D"
                                  :time_style     "HH:mm"}

                                 "EXAMPLE_TIMESTAMP"
                                 {:time_enabled "seconds"}

                                 nil)]
                  (cond-> col
                    settings (assoc :settings settings))))]
        (mt/with-temp [:model/Card {native-card-id :id} (-> (mt/card-with-source-metadata-for-query
                                                             (mt/native-query {:query q}))
                                                            (assoc :name "NATIVE"))
                       :model/Card {model-card-metadata :result_metadata
                                    model-card-id  :id} (-> (mt/card-with-source-metadata-for-query
                                                             {:database (mt/id)
                                                              :type     :query
                                                              :query    (model-query native-card-id)})
                                                            (merge {:name "MODEL"
                                                                    :type :model})
                                                            (update :result_metadata
                                                                    #(mapv model-metadata-fn %)))
                       :model/Card {meta-model-card-metadata :result_metadata
                                    meta-model-card-id :id} (-> (mt/card-with-source-metadata-for-query
                                                                 (mt/mbql-query nil
                                                                   {:source-table (format "card__%s" model-card-id)}))
                                                                (assoc :name "METAMODEL"
                                                                       :type :model
                                                                       :visualization_settings
                                                                       {:column_settings {"[\"name\",\"FULL_DATETIME_UTC\"]"
                                                                                          {:date_abbreviate true
                                                                                           :time_enabled    "milliseconds"
                                                                                           :time_style      "HH:mm"}
                                                                                          "[\"name\",\"EXAMPLE_TIMESTAMP\"]"
                                                                                          {:time_enabled "milliseconds"}
                                                                                          "[\"name\",\"EXAMPLE_TIME\"]"
                                                                                          {:time_enabled nil}
                                                                                          "[\"name\",\"FULL_DATETIME_PACIFIC\"]"
                                                                                          {:time_enabled nil}}})
                                                                (update :result_metadata #(mapv metamodel-metadata-fn %)))
                       :model/Dashboard {dash-id :id} {:name "The Dashboard"}
                       :model/DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                                     :card_id      native-card-id}
                       :model/DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                                      :card_id      model-card-id}
                       :model/DashboardCard {metamodel-dash-card-id :id} {:dashboard_id dash-id
                                                                          :card_id      meta-model-card-id}
                       :model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Consistent Time Formatting Pulse"
                                                      :dashboard_id dash-id}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           native-card-id
                                           :dashboard_card_id base-dash-card-id
                                           :include_csv       true}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           model-card-id
                                           :dashboard_card_id model-dash-card-id
                                           :include_csv       true}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           meta-model-card-id
                                           :dashboard_card_id metamodel-dash-card-id
                                           :include_csv       true}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (let [attached-data     (run-pulse-and-return-attached-csv-data! pulse)
                get-res           #(-> (get attached-data %)
                                       (update-vals first)
                                       (dissoc "X"))
                native-results    (get-res "NATIVE.csv")
                model-results     (get-res "MODEL.csv")
                metamodel-results (get-res "METAMODEL.csv")]
            (testing "Sanity check: metadata should have correct display names"
              (testing "model card"
                (is (= ["Full Datetime Utc"
                        "Full Datetime Pacific"
                        "Example Timestamp"
                        "Example Timestamp With Time Zone"
                        "Example Date"
                        "Example Time"
                        "Example Year"
                        "Example Month"
                        "Example Day"
                        "Example Week Number"
                        "Example Week: Week"
                        "Example Hour"
                        "Example Minute"
                        "Example Second"]
                       (map :display_name model-card-metadata))))
              (testing "metamodel card"
                (is (= (map :display_name model-card-metadata)
                       (map :display_name meta-model-card-metadata))))
              (testing "metamodel results"
                (is (= (sort (map :display_name model-card-metadata))
                       (sort (keys metamodel-results))))))
            ;; Note that these values are obtained by inspection since the UI formats are in the FE code.
            ;;
            ;; TODO (Cam 6/18/25) -- these fail for me locally with `Dec` instead of `December` -- see #59803
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
                      "EXAMPLE_WEEK_NUMBER"              "50"
                      "EXAMPLE_HOUR"                     "15"
                      "EXAMPLE_MINUTE"                   "30"
                      "EXAMPLE_SECOND"                   "45"}
                     ;; the EXAMPLE_WEEK is a normal timestamp.
                     ;; We care about it in the context of the Model, not the native results
                     ;; so dissoc it here.
                     (dissoc native-results "EXAMPLE_WEEK"))))
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
                      "Example Week Number"              "50"
                      "Example Week: Week"               "December 10, 2023 - December 16, 2023"
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
            (testing "Visualization settings overwrite custom metadata column settings"
              (is (= "December 11, 2023, 3:30:45.123 PM"
                     (metamodel-results "Example Timestamp"))))
            (testing "Setting time-enabled to nil for a date time column results in only showing the date"
              (is (= "December 11, 2023"
                     (metamodel-results "Full Datetime Pacific"))))
            (testing "Setting time-enabled to nil for a time column just returns an empty string"
              (is (= ""
                     (metamodel-results "Example Time"))))
            (testing "Week Units Are Displayed as a Date Range"
              (is (= "December 10, 2023 - December 16, 2023"
                     (metamodel-results "Example Week: Week"))))))))))

(deftest renamed-column-names-are-applied-test
  (testing "CSV attachments should have the same columns as displayed in Metabase (#18572)"
    (mt/with-temporary-setting-values [custom-formatting nil]
      (let [query        (mt/mbql-query orders
                           {:fields       [$id $tax $total $discount $quantity [:expression "Tax Rate"]]
                            :expressions  {"Tax Rate" [:/ $tax $total]},
                            :limit        10})
            viz-settings {:table.cell_column "TAX",
                          :column_settings   {(format "[\"ref\",[\"field\",%s,null]]" (mt/id :orders :id))
                                              {:column_title "THE_ID"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :tax))
                                              {:column_title "ORDER TAX"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :total))
                                              {:column_title "Total Amount"},
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :discount))
                                              {:column_title "Discount Applied"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Integer\"}]]"
                                                      (mt/id :orders :quantity))
                                              {:column_title "Amount Ordered"}
                                              "[\"ref\",[\"expression\",\"Tax Rate\"]]"
                                              {:column_title "Effective Tax Rate"}}}]
        (mt/with-temp [:model/Card {base-card-name :name
                                    base-card-id   :id} {:name                   "RENAMED"
                                                         :dataset_query          query
                                                         :visualization_settings viz-settings}
                       :model/Card {model-card-name :name
                                    model-card-id   :id
                                    model-metadata  :result_metadata} {:name          "MODEL"
                                                                       :type          :model
                                                                       :dataset_query {:database (mt/id)
                                                                                       :type     :query
                                                                                       :query    {:source-table
                                                                                                  (format "card__%s" base-card-id)}}}
                       :model/Card {meta-model-card-name :name
                                    meta-model-card-id   :id} {:name            "MODEL_WITH_META"
                                                               :type            :model
                                                               :dataset_query   {:database (mt/id)
                                                                                 :type     :query
                                                                                 :query    {:source-table
                                                                                            (format "card__%s" model-card-id)}}
                                                               :result_metadata (mapv
                                                                                 (fn [{column-name :name :as col}]
                                                                                   (cond-> col
                                                                                     (= "DISCOUNT" column-name)
                                                                                     (assoc :display_name "Amount of Discount")
                                                                                     (= "TOTAL" column-name)
                                                                                     (assoc :display_name "Grand Total")
                                                                                     (= "QUANTITY" column-name)
                                                                                     (assoc :display_name "N")))
                                                                                 model-metadata)}
                       :model/Card {question-card-name :name
                                    question-card-id   :id} {:name                   "FINAL_QUESTION"
                                                             :dataset_query          {:database (mt/id)
                                                                                      :type     :query
                                                                                      :query    {:source-table
                                                                                                 (format "card__%s" meta-model-card-id)}}
                                                             :visualization_settings {:table.pivot_column "DISCOUNT",
                                                                                      :table.cell_column  "TAX",
                                                                                      :column_settings    {(format
                                                                                                            "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Integer\"}]]"
                                                                                                            (mt/id :orders :quantity))
                                                                                                           {:column_title "Count"}
                                                                                                           (format
                                                                                                            "[\"ref\",[\"field\",%s,{\"base-type\":\"type/BigInteger\"}]]"
                                                                                                            (mt/id :orders :id))
                                                                                                           {:column_title "IDENTIFIER"}}}}
                       :model/Dashboard {dash-id :id} {:name "The Dashboard"}
                       :model/DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                                     :card_id      base-card-id}
                       :model/DashboardCard {model-dash-card-id :id} {:dashboard_id dash-id
                                                                      :card_id      model-card-id}
                       :model/DashboardCard {meta-model-dash-card-id :id} {:dashboard_id dash-id
                                                                           :card_id      meta-model-card-id}
                       :model/DashboardCard {question-dash-card-id :id} {:dashboard_id dash-id
                                                                         :card_id      question-card-id}
                       :model/Pulse {pulse-id :id
                                     :as      pulse} {:name "Consistent Column Names"
                                                      :dashboard_id dash-id}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           base-card-id
                                           :dashboard_card_id base-dash-card-id
                                           :include_csv       true}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           model-card-id
                                           :dashboard_card_id model-dash-card-id
                                           :include_csv       true}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           meta-model-card-id
                                           :dashboard_card_id meta-model-dash-card-id
                                           :include_csv       true}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           question-card-id
                                           :dashboard_card_id question-dash-card-id
                                           :include_csv       true}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (let [attachment-name->cols (mt/with-fake-inbox
                                        (with-redefs [channel.settings/bcc-enabled? (constantly false)]
                                          (mt/with-test-user nil
                                            (pulse.send/send-pulse! pulse)))
                                        (->>
                                         (get-in @mt/inbox ["rasta@metabase.com" 0 :body])
                                         (keep
                                          (fn [{:keys [type content-type file-name content]}]
                                            (when (and
                                                   (= :attachment type)
                                                   (= "text/csv" content-type))
                                              [(strip-timestamp file-name)
                                               (first (csv/read-csv (slurp content)))])))
                                         (into {})))]
            (testing "Renaming columns via viz settings is correctly applied to the CSV export"
              (is (= ["THE_ID" "ORDER TAX" "Total Amount" "Discount Applied ($)" "Amount Ordered" "Effective Tax Rate"]
                     (attachment-name->cols (format "%s.csv" base-card-name)))))
            (testing "A question derived from another question does not bring forward any renames"
              (is (= ["ID" "Tax" "Total" "Discount ($)" "Quantity" "Tax Rate"]
                     (attachment-name->cols (format "%s.csv" model-card-name)))))
            (testing "A model with custom metadata shows the renamed metadata columns"
              (is (= ["ID" "Tax" "Grand Total" "Amount of Discount ($)" "N" "Tax Rate"]
                     (attachment-name->cols (format "%s.csv" meta-model-card-name)))))
            (testing "A question based on a model retains the curated metadata column names but overrides these with any existing visualization_settings"
              (is (= ["IDENTIFIER" "Tax" "Grand Total" "Amount of Discount ($)" "Count" "Tax Rate"]
                     (attachment-name->cols (format "%s.csv" question-card-name)))))))))))

(defn- run-pulse-and-return-scalars!
  "Simulate sending the pulse email, get the html body of the response and return the scalar value of the card."
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [channel.settings/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (pulse.send/send-pulse! pulse)))
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
    (mt/dataset test-data
      (let [;; test card 1 'narrows' the query to a single column (the "TAX" field)
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
        (mt/with-temp [:model/Card          {card-id1 :id} test-card1
                       :model/Card          {card-id2 :id} test-card2
                       :model/Dashboard     {dash-id :id} {:name "just dash"}
                       :model/DashboardCard {dash-card-id1 :id} {:dashboard_id dash-id
                                                                 :card_id      card-id1}
                       :model/DashboardCard {dash-card-id2 :id} {:dashboard_id dash-id
                                                                 :card_id      card-id2}
                       :model/Pulse         {pulse-id :id :as pulse} {:name         "Test Pulse"
                                                                      :dashboard_id dash-id}
                       :model/PulseCard             _             {:pulse_id          pulse-id
                                                                   :card_id           card-id1
                                                                   :dashboard_card_id dash-card-id1}
                       :model/PulseCard             _             {:pulse_id          pulse-id
                                                                   :card_id           card-id2
                                                                   :dashboard_card_id dash-card-id2}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          ;; First value is the scalar returned from card1 (specified "TAX" field directly in the query)
          ;; Second value is the scalar returned from card2 (scalar field specified only in viz-settings, not the query)
          (is (= ["2.07" "2.07"]
                 (run-pulse-and-return-scalars! pulse))))))))

(defn- run-pulse-and-return-data-tables!
  "Run the pulse and return the sequence of inlined html tables as data. Empty tables will be [].
  If not pulse is sent, return `nil`."
  [pulse]
  (mt/with-fake-inbox
    (with-redefs [channel.settings/bcc-enabled? (constantly false)]
      (mt/with-test-user nil
        (pulse.send/send-pulse! pulse)))
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

(defmacro ^:private with-skip-if-empty-pulse-result!
  "Provide a fixture that runs body using the provided pulse results (symbol), the value of `:skip_if_empty` for the
  pulse, and the queries for two cards. This enables a variety of cases to test the behavior of `:skip_if_empty` based
  on the presence or absence of card data."
  [[result skip-if-empty? query1 query2] & body]
  `(mt/with-temp [:model/Card {~'base-card-id :id} {:name          "Card1"
                                                    :dataset_query {:database (mt/id)
                                                                    :type     :query
                                                                    :query    ~query1}}
                  :model/Card {~'empty-card-id :id} {:name          "Card2"
                                                     :dataset_query {:database (mt/id)
                                                                     :type     :query
                                                                     :query    ~query2}}
                  :model/Dashboard {~'dash-id :id} {:name "The Dashboard"}
                  :model/DashboardCard {~'base-dash-card-id :id} {:dashboard_id ~'dash-id
                                                                  :card_id      ~'base-card-id}
                  :model/DashboardCard {~'empty-dash-card-id :id} {:dashboard_id ~'dash-id
                                                                   :card_id      ~'empty-card-id}
                  :model/Pulse {~'pulse-id :id :as ~'pulse} {:name          "Only populated pulse"
                                                             :dashboard_id  ~'dash-id
                                                             :skip_if_empty ~skip-if-empty?}
                  :model/PulseCard ~'_ {:pulse_id          ~'pulse-id
                                        :card_id           ~'base-card-id
                                        :dashboard_card_id ~'base-dash-card-id
                                        :include_csv       true
                                        :position          1}
                  :model/PulseCard ~'_ {:pulse_id          ~'pulse-id
                                        :card_id           ~'empty-card-id
                                        :dashboard_card_id ~'empty-dash-card-id
                                        :include_csv       true
                                        :position          2}
                  :model/PulseChannel {~'pulse-channel-id :id} {:channel_type :email
                                                                :pulse_id     ~'pulse-id
                                                                :enabled      true}
                  :model/PulseChannelRecipient ~'_ {:pulse_channel_id ~'pulse-channel-id
                                                    :user_id          (mt/user->id :rasta)}]
     (let [~result (run-pulse-and-return-data-tables! ~'pulse)]
       ~@body)))

(deftest skip-if-empty-test
  #_{:clj-kondo/ignore [:unresolved-symbol]}
  (testing "Only send non-empty cards when 'Don't send if there aren't results is enabled' (#34777)"
    (mt/dataset test-data
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
              (with-skip-if-empty-pulse-result! [result skip-if-empty? query query2]
                (testing "Show all the data"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]
                          [["1" "2.07"] ["2" "6.1"] ["3" "2.9"]]]
                         result)))))
            (testing "Not everything has results"
              (with-skip-if-empty-pulse-result! [result skip-if-empty? query empty-query]
                (testing "The second table is empty since there are no results"
                  (is (= [[["1" "2.07"] ["2" "6.1"]] []] result)))))
            (testing "No results"
              (with-skip-if-empty-pulse-result! [result skip-if-empty? empty-query empty-query]
                (testing "We send the email anyways, despite everything being empty due to no results"
                  (is (= [[] []] result)))))))
        (testing "Cases for when 'Don't send if there aren't results is enabled' is true"
          (let [skip-if-empty? true]
            (testing "Everything has results"
              (with-skip-if-empty-pulse-result! [result skip-if-empty? query query2]
                (testing "When everything has results, we see everything"
                  (is (= 2 (count result))))
                (testing "Show all the data"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]
                          [["1" "2.07"] ["2" "6.1"] ["3" "2.9"]]]
                         result)))))
            (testing "Not everything has results"
              (with-skip-if-empty-pulse-result! [result skip-if-empty? query empty-query]
                (testing "We should only see a single data table in the result"
                  (is (= 1 (count result))))
                (testing "The single result should contain the card with data in it"
                  (is (= [[["1" "2.07"] ["2" "6.1"]]] result)))))
            (testing "No results"
              (with-skip-if-empty-pulse-result! [result skip-if-empty? empty-query empty-query]
                (testing "Don't send a pulse if no results at all"
                  (is (nil? result)))))))))))

(deftest text-cards-are-not-skipped-when-empty-data-is-skipped-test
  (testing "Do not skip text cards when filtering out pulse cards with empty results (#39190)"
    (let [card-text "THIS IS TEXT THAT SHOULD NOT GO AWAY"]
      (mt/dataset test-data
        ;; If we don't skip empty cards, we expect 2 cards.
        ;; If we do skip empty cards, we expect 1 card.
        (doseq [[skip? expected-count] [[false 2] [true 1]]]
          (mt/with-temp
            [:model/Card {base-card-id :id} {:name          "Card1"
                                             :dataset_query {:database (mt/id)
                                                             :type     :query
                                                             :query    {:source-table (mt/id :orders)
                                                                        :fields       [[:field (mt/id :orders :id) {:base-type :type/BigInteger}]
                                                                                       [:field (mt/id :orders :tax) {:base-type :type/Float}]]
                                                                        :limit        2}}}
             :model/Card {empty-card-id :id} {:name          "Card1"
                                              :dataset_query {:database (mt/id)
                                                              :type     :query
                                                              :query    {:source-table (format "card__%s" base-card-id)
                                                                         :filter       [:= [:field "TAX" {:base-type :type/Float}] -1]}}}
             :model/Dashboard {dash-id :id} {:name "The Dashboard"}
             :model/DashboardCard _ {:dashboard_id dash-id
                                     :visualization_settings
                                     {:virtual_card {:display :text}
                                      :text         card-text}}
             :model/DashboardCard {base-dash-card-id :id} {:dashboard_id dash-id
                                                           :card_id      base-card-id}
             :model/DashboardCard {empty-dash-card-id :id} {:dashboard_id dash-id
                                                            :card_id      empty-card-id}
             :model/Pulse {pulse-id :id :as pulse} {:name          "Only populated pulse"
                                                    :dashboard_id  dash-id
                                                    :skip_if_empty skip?}
             :model/PulseCard _ {:pulse_id          pulse-id
                                 :card_id           base-card-id
                                 :dashboard_card_id base-dash-card-id
                                 :include_csv       true}
             :model/PulseCard _ {:pulse_id          pulse-id
                                 :card_id           empty-card-id
                                 :dashboard_card_id empty-dash-card-id
                                 :include_csv       true}
             :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                         :pulse_id     pulse-id
                                                         :enabled      true}
             :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                             :user_id          (mt/user->id :rasta)}]
            (mt/with-fake-inbox
              (with-redefs [channel.settings/bcc-enabled? (constantly false)]
                (mt/with-test-user nil
                  (pulse.send/send-pulse! pulse)))
              (let [html-body (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])
                    data-tables (hik.s/select
                                 (hik.s/class "pulse-body")
                                 (-> html-body hik/parse hik/as-hickory))]
                (testing "The expected count will change if empty tables are skipped."
                  (is (= expected-count (count data-tables))))
                (testing "The text card should always be present"
                  (is (true? (str/includes? html-body card-text))))))))))))

(deftest ^:sequential xray-dashboards-work-test
  (testing "Dashboards produced by generated by X-Rays should not produce bad results (#38350)"
    ;; Disable search index, as the way the database is reset at the end can flake somehow.
    ;; This test has nothing to do with search, so not wasting more time on understanding it.
    (search.tu/with-index-disabled
      (mt/dataset test-data
        (mt/test-helpers-set-global-values!
          (let [generated-dashboard (mt/user-http-request :crowberto :get 200 (format "automagic-dashboards/table/%d" (mt/id :orders)))
                saved-dashboard     (mt/user-http-request :crowberto :post 200 "dashboard/save" generated-dashboard)
                {dash-id   :id
                 title     :name
                 dashcards :dashcards} (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" (u/the-id saved-dashboard)))]
            (testing "Make sure our content was generated and saved"
              (is (= 11 (count dashcards)))
              (is (= "A look at Orders" title)))
            (mt/with-temp [:model/Pulse {pulse-id :id :as pulse} {:name         "Test Pulse"
                                                                  :dashboard_id dash-id}
                           :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                       :pulse_id     pulse-id
                                                                       :enabled      true}
                           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                           :user_id          (mt/user->id :rasta)}]
              (mt/with-fake-inbox
                (with-redefs [channel.settings/bcc-enabled? (constantly false)]
                  (mt/with-test-user nil
                    (pulse.send/send-pulse! pulse)))
                (let [html-body (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])]
                  (is (false? (str/includes? html-body "An error occurred while displaying this card."))))))
            (t2/delete! :model/Dashboard :id dash-id)))))))

(deftest geographic-coordinates-formatting-test
  (testing "Longitude and latitude columns should format correctly on export (#38419)"
    (mt/dataset airports
      (let [query     (mt/mbql-query airport
                        {:fields   [$id $longitude $latitude]
                         :order-by [[:asc $id]]
                         :limit    5})
            base-card {:dataset_query query}
            model-eid (u/generate-nano-id)
            model     {:dataset_query   query
                       :type            :model
                       :entity_id       model-eid
                       :result_metadata [{:name         "ID"
                                          :display_name "ID"
                                          :id           (mt/id :airport :id)
                                          :base_type    :type/Integer}
                                         {:semantic_type :type/Longitude
                                          :name          "LONGITUDE"
                                          :display_name  "Longitude"
                                          :base_type     :type/Float}
                                         {:semantic_type :type/Latitude
                                          :name          "LATITUDE"
                                          :display_name  "Latitude"
                                          :base_type     :type/Float}]}]
        (mt/with-temp [:model/Card {card-id :id} base-card
                       :model/Card {model-id :id} model
                       :model/Dashboard {dash-id :id} {}
                       :model/DashboardCard {dash-card-id :id} {:dashboard_id dash-id
                                                                :card_id      card-id}
                       :model/DashboardCard {model-card-id :id} {:dashboard_id dash-id
                                                                 :card_id      model-id}
                       :model/Pulse {pulse-id :id :as pulse} {:name         "Test Pulse"
                                                              :dashboard_id dash-id}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           card-id
                                           :dashboard_card_id dash-card-id}
                       :model/PulseCard _ {:pulse_id          pulse-id
                                           :card_id           model-id
                                           :dashboard_card_id model-card-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (testing "The html output renders the table cells as geographic coordinates"
            (is (= [[["1" "9.85" "57.09"]
                     ["2" "39.22" "-6.22"]
                     ["3" "-2.2" "57.2"]
                     ["4" "-89.68" "39.84"]
                     ["5" "54.65" "24.43"]]
                    [["1" "9.84924316° E" "57.09275891° N"]
                     ["2" "39.22489900° E" "6.22202000° S"]
                     ["3" "2.19777989° W" "57.20190048° N"]
                     ["4" "89.67790222° W" "39.84410095° N"]
                     ["5" "54.65110016° E" "24.43300056° N"]]]
                   (run-pulse-and-return-data-tables! pulse)))))))))

(deftest empty-dashboard-test
  (testing "A completely empty dashboard should still send an email"
    (notification.tu/with-notification-testing-setup!
      (mt/dataset test-data
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Completely empty dashboard"}
                       :model/Pulse {pulse-id :id :as pulse} {:name         "Test Pulse"
                                                              :dashboard_id dash-id}
                       :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                   :pulse_id     pulse-id
                                                                   :enabled      true}
                       :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                       :user_id          (mt/user->id :rasta)}]
          (mt/with-fake-inbox
            (with-redefs [channel.settings/bcc-enabled? (constantly false)]
              (mt/with-test-user nil
                (pulse.send/send-pulse! pulse)))
            (is (string? (get-in @mt/inbox ["rasta@metabase.com" 0 :body 0 :content])))))))))
