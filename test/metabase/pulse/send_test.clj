(ns metabase.pulse.send-test
  "These are mostly Alerts test, dashboard subscriptions could be found in
  [[metabase.pulse.dashboard-subscription-test]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.http-test :as channel.http-test]
   [metabase.channel.render.body :as body]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn warn-possible-rebuild
    [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `bun run build-static-viz`\n\n"
      (thunk))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Util Fns & Macros                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-alert-message
  [& [data]]
  (merge {:subject        "Alert: Test card has results"
          :recipients     #{"rasta@metabase.com"}
          :message-type   :attachments
          :recipient-type nil
          :message        [{pulse.test-util/card-name true}
                           ;; card static-viz
                           pulse.test-util/png-attachment
                           ;; icon
                           pulse.test-util/png-attachment
                           ;; alert always includes result as csv
                           pulse.test-util/csv-attachment]}
         data))

(defn- default-slack-blocks
  [card-id include-image?]
  (cond->
   [{:type "header" :text {:type "plain_text" :text "🔔 Test card" :emoji true}}
    {:type "section"
     :text
     {:type "mrkdwn" :text (format "<https://testmb.com/question/%d|Test card>" card-id) :verbatim true}}]
    include-image?
    (conj {:type "image"
           :slack_file {:id "Test card.png"}
           :alt_text "Test card"})))

(defn do-with-pulse-for-card
  "Creates a Pulse and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if specified), then
  invokes

    (f pulse)"
  [{:keys [pulse pulse-card channel pulse-channel card]
    :or   {pulse-channel :email}}
   f]
  (mt/with-temp [:model/Pulse        {pulse-id :id, :as pulse} (->> pulse
                                                                    (merge {:name            "Pulse Name"
                                                                            :alert_condition "rows"}))
                 :model/PulseCard    _ (merge {:pulse_id        pulse-id
                                               :card_id         (u/the-id card)
                                               :position        0}
                                              pulse-card)
                 ;; channel is currently only used for http
                 :model/Channel      {chn-id :id} (merge {:type    :channel/http
                                                          :details {:url         "https://metabase.com/testhttp"
                                                                    :auth-method "none"}}
                                                         channel)
                 :model/PulseChannel {pc-id :id} (case pulse-channel
                                                   :email
                                                   {:pulse_id pulse-id
                                                    :channel_type "email"}

                                                   :slack
                                                   {:pulse_id     pulse-id
                                                    :channel_type "slack"
                                                    :details      {:channel "#general"}}

                                                   :http
                                                   {:pulse_id     pulse-id
                                                    :channel_type "http"
                                                    :channel_id   chn-id})]
    (if (= pulse-channel :email)
      (mt/with-temp [:model/PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
                                                     :pulse_channel_id pc-id}]
        (f pulse))
      (f pulse))))

(defmacro with-pulse-for-card
  "e.g.

    (with-pulse-for-card [pulse {:card my-card, :pulse pulse-properties, ...}]
      ...)"
  [[pulse-binding properties] & body]
  `(do-with-pulse-for-card ~properties (fn [~pulse-binding] ~@body)))

(defn- do-test!
  "Run a single Pulse test with a standard set of boilerplate. Creates Card, Pulse, and other related objects using
  `card`, `pulse`, `pulse-card` properties, then sends the Pulse; finally, test assertions in `assert` are invoked.
  `assert` can contain `:email` and/or `:slack` assertions, which are used to test an email and Slack version of that
  Pulse respectively. `:assert` functions have the signature

    (f object-ids send-pulse!-response)

  Example:

    (do-test
     {:card   {:dataset_query (mt/mbql-query checkins)}
      :assert {:slack (fn [{:keys [pulse-id]} response]
                        (is (= {:sent pulse-id}
                               response)))}})"
  [{:keys [card channel pulse pulse-card display fixture], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack :http) assertions)]}
  (doseq [channel-type [:email :slack :http]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (notification.tu/with-notification-testing-setup!
        (notification.tu/with-channel-fixtures [(keyword "channel" (name channel-type))]
          (mt/with-temp [:model/Card {card-id :id} (merge {:name    pulse.test-util/card-name
                                                           :display (or display :line)}
                                                          card)]
            (with-pulse-for-card [{pulse-id :id}
                                  {:card          card-id
                                   :pulse         pulse
                                   :channel       channel
                                   :pulse-card    pulse-card
                                   :pulse-channel channel-type}]
              (letfn [(thunk* []
                        (f {:card-id card-id, :pulse-id pulse-id}
                           ((keyword "channel" (name channel-type))
                            (pulse.test-util/with-captured-channel-send-messages!
                              (mt/with-temporary-setting-values [site-url "https://testmb.com"]
                                (notification.tu/with-javascript-visualization-stub
                                  (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))))))))
                      (thunk []
                        (if fixture
                          (fixture {:card-id card-id, :pulse-id pulse-id} thunk*)
                          (thunk*)))]
                (case channel-type
                  (:http :email) (thunk)
                  :slack (pulse.test-util/slack-test-setup! (thunk)))))))))))

(defn- tests!
  "Convenience for writing multiple tests using `do-test`. `common` is a map of shared properties as passed to `do-test`
  that is deeply merged with the individual maps for each test. Other args are alternating `testing` context messages
  and properties as passed to `do-test`:

    (tests
     ;; shared properties used for both tests
     {:card {:dataset_query (mt/mbql-query)}}

     \"Test 1\"
     {:assert {:email (fn [_ _] (is ...))}}

     \"Test 2\"
     ;; override just the :display property of the Card
     {:card   {:display \"table\"}
      :assert {:email (fn [_ _] (is ...))}})"
  [common & {:as message->m}]
  (doseq [[message m] message->m]
    (testing message
      (do-test! (merge-with merge common m)))))

(def ^:private test-card-regex (re-pattern pulse.test-util/card-name))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Tests                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-timeseries-test
  (do-test!
   {:card
    (merge
     (pulse.test-util/checkins-query-card {:breakout [!day.date]
                                           :limit 1})
     {:visualization_settings {:graph.dimensions ["DATE"]
                               :graph.metrics    ["count"]}})
    :assert
    {:email
     (fn [_ [email]]
       (is (= (rasta-alert-message)
              (mt/summarize-multipart-single-email email test-card-regex))))

     :slack
     (fn [{:keys [card-id]} [message]]
       (is (=? {:channel "#general"
                :blocks (default-slack-blocks card-id true)}
               message)))

     :http
     (fn [{:keys [card-id pulse-id]} [request]]
       (let [pulse (t2/select-one :model/Pulse pulse-id)
             card  (t2/select-one :model/Card card-id)]
         (is (=? {:body {:type               "alert"
                         :alert_id           pulse-id
                         :alert_creator_id   (mt/malli=? int?)
                         :alert_creator_name (t2/select-one-fn :common_name :model/User (:creator_id pulse))
                         :data               {:type          "question"
                                              :question_id   card-id
                                              :question_name (:name card)
                                              :question_url  (mt/malli=? [:fn #(str/ends-with? % (str card-id))])
                                              :visualization (mt/malli=? [:fn #(str/starts-with? % "data:image/png;base64")])
                                              :raw_data      {:cols ["DATE" "count"], :rows [["2013-01-03T00:00:00Z" 1]]}}
                         :sent_at            (mt/malli=? :any)}}
                 request))))}}))

(deftest basic-table-test
  (tests! {:display :table}
          "9 results, so no attachment"
          {:card    (pulse.test-util/checkins-query-card {:aggregation nil, :limit 9})

           :fixture
           (fn [_ thunk]
             (with-redefs [body/attached-results-text (pulse.test-util/wrap-function @#'body/attached-results-text)]
               (thunk)))

           :assert
           {:email
            (fn [_ [email]]
              (is (= (rasta-alert-message {:message [{pulse.test-util/card-name                            true
                                                      "More results have been included"                    false
                                                      "ID</th>"                                            true
                                                      "<a href=\\\"https://testmb.com/dashboard/" false}
                                                     pulse.test-util/png-attachment
                                                     pulse.test-util/csv-attachment]})
                     (mt/summarize-multipart-single-email
                      email
                      test-card-regex
                      #"More results have been included"
                      #"ID</th>"
                      #"<a href=\"https://testmb.com/dashboard/"))))

            :slack
            (fn [{:keys [card-id]} [message]]
              (testing "\"more results in attachment\" text should not be present for Slack Pulses"
                (testing "Pulse results"
                  (is (=? {:channel "#general"
                           :blocks (default-slack-blocks card-id true)}
                          message)))
                (testing "attached-results-text should be invoked exactly once"
                  (is (= 1
                         (count (pulse.test-util/input @#'body/attached-results-text)))))
                (testing "attached-results-text should return nil since it's a slack message"
                  (is (= [nil]
                         (pulse.test-util/output @#'body/attached-results-text))))))}}

          "11 rows in the results no longer causes a CSV attachment per issue #36441."
          {:card (pulse.test-util/checkins-query-card {:aggregation nil, :limit 11})

           :assert
           {:email
            (fn [_ [email]]
              (is (= (rasta-alert-message {:message [{pulse.test-util/card-name         true
                                                      "More results have been included" false
                                                      "ID</th>"                         true}
                                                     pulse.test-util/png-attachment
                                                     pulse.test-util/csv-attachment]})
                     (mt/summarize-multipart-single-email
                      email
                      test-card-regex
                      #"More results have been included" #"ID</th>"))))}}))

#_(deftest xls-test
    (testing "If the pulse is already configured to send an XLS, no need to include a CSV"
      (do-test!
       {:card       {:dataset_query (mt/mbql-query checkins)}
        :pulse-card {:include_xls true}
        :display    :table

        :assert
        {:email
         (fn [_ [email]]
           (is (= ;; There's no PNG with a table visualization, so only assert on one png (the dashboard icon)
                (rasta-alert-message {:message [{pulse.test-util/card-name true}
                                                pulse.test-util/png-attachment
                                                pulse.test-util/xls-attachment]})
                (mt/summarize-multipart-single-email email test-card-regex))))}})))

;; Not really sure how this is significantly different from `xls-test`
#_(deftest xls-test-2
    (testing "Basic test, 1 card, 1 recipient, with XLS attachment"
      (do-test!
       {:card
        (merge
         (pulse.test-util/checkins-query-card {:breakout [!day.date]})
         {:visualization_settings {:graph.dimensions ["DATE"]
                                   :graph.metrics    ["count"]}})
        :pulse-card {:include_xls true}
        :assert
        {:email
         (fn [_ [email]]
           (is (= (rasta-alert-message {:message [{pulse.test-util/card-name true}
                                                  pulse.test-util/png-attachment
                                                  pulse.test-util/png-attachment
                                                  pulse.test-util/xls-attachment]})
                  (mt/summarize-multipart-single-email email test-card-regex))))}})))

(deftest ensure-constraints-test
  (testing "Validate pulse queries are limited by `default-query-constraints`"
    (do-test!
     {:card
      (pulse.test-util/checkins-query-card {:aggregation nil})
      :display :table

      :fixture
      (fn [_ thunk]
        (mt/with-temporary-setting-values [attachment-row-limit 30]
          (thunk)))
      :pulse-card {:include_csv true}
      :assert
      {:email
       (fn [_ [email]]
         (is (true? (some? email))
             "Should have a message in the inbox")
         (when email
           (let [filename (-> email :message last :content)
                 exists?  (some-> filename io/file .exists)]
             (testing "File should exist"
               (is (true?
                    exists?)))
             (testing (str "tmp file = %s" filename)
               (testing "Slurp in the generated CSV and count the lines found in the file"
                 (when exists?
                   (testing "Should return 30 results (the redef'd limit) plus the header row"
                     (is (= 31
                            (-> (slurp filename) str/split-lines count))))))))))}})))

(deftest multiple-recipients-test
  (testing "Pulse should be sent to two recipients"
    (do-test!
     {:card
      (merge
       (pulse.test-util/checkins-query-card {:breakout [!day.date]})
       {:visualization_settings {:graph.dimensions ["DATE"]
                                 :graph.metrics    ["count"]}})

      :fixture
      (fn [{:keys [pulse-id]} thunk]
        (mt/with-temp [:model/PulseChannelRecipient _ {:user_id          (mt/user->id :crowberto)
                                                       :pulse_channel_id (t2/select-one-pk :model/PulseChannel :pulse_id pulse-id)}]
          (thunk)))

      :assert
      {:email
       (fn [_ [email]]
         (is (= (rasta-alert-message {:recipients #{"rasta@metabase.com" "crowberto@metabase.com"}})
                (mt/summarize-multipart-single-email email test-card-regex))))}})))

(deftest rows-alert-test
  (testing "Rows alert"
    (tests! {:pulse {:alert_condition "rows", :alert_first_only false}}
            "with data"
            {:card
             (merge
              (pulse.test-util/checkins-query-card {:breakout [!day.date]})
              {:visualization_settings {:graph.dimensions ["DATE"]
                                        :graph.metrics    ["count"]}})

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:message [{pulse.test-util/card-name true
                                                        "More results have been included" false}
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/csv-attachment]})
                       (mt/summarize-multipart-single-email email test-card-regex #"More results have been included"))))

              :slack
              (fn [{:keys [card-id]} [message]]
                (is (=? {:channel "#general"
                         :blocks (default-slack-blocks card-id true)}
                        message)))}}

            "with no data"
            {:card
             (pulse.test-util/checkins-query-card {:filter   [:> $date "2017-10-24"]
                                                   :breakout [!day.date]})
             :assert
             {:email
              (fn [_ emails]
                (is (empty? emails)))}}

            "too much data"
            {:card
             (pulse.test-util/checkins-query-card {:limit 21, :aggregation nil})
             :display :table

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:message [{pulse.test-util/card-name         true
                                                        "More results have been included" false
                                                        "ID</th>"                         true}
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/csv-attachment]})
                       (mt/summarize-multipart-single-email email test-card-regex
                                                            #"More results have been included"
                                                            #"ID</th>"))))}})))

(deftest above-goal-alert-test
  (testing "above goal alert"
    (tests! {:pulse {:alert_condition  "goal"
                     :alert_first_only false
                     :alert_above_goal true}}
            "with data"
            {:card
             (merge (pulse.test-util/checkins-query-card {:filter   [:between $date "2014-04-01" "2014-06-01"]
                                                          :breakout [!day.date]})
                    {:display                :line
                     :visualization_settings {:graph.show_goal  true
                                              :graph.goal_value 5.9
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:subject "Alert: Test card has reached its goal"
                                             :message [{pulse.test-util/card-name true
                                                        "This question has reached its goal of 5\\.9\\." true}
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/csv-attachment]})
                       (mt/summarize-multipart-single-email email test-card-regex
                                                            #"This question has reached its goal of 5\.9\."))))}}

            "no data"
            {:card
             (merge (pulse.test-util/checkins-query-card {:filter   [:between $date "2014-02-01" "2014-04-01"]
                                                          :breakout [!day.date]})
                    {:display                :area
                     :visualization_settings {:graph.show_goal  true
                                              :graph.goal_value 5.9
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})

             :assert
             {:email
              (fn [_ emails]
                (is (empty? emails)))}}

            "with progress bar"
            {:card
             (merge (pulse.test-util/venues-query-card "max")
                    {:display                :progress
                     :visualization_settings {:progress.goal    3
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:subject "Alert: Test card has reached its goal"})
                       (mt/summarize-multipart-single-email email test-card-regex))))}})))

(deftest below-goal-alert-test
  (testing "Below goal alert"
    (tests! {:pulse {:alert_condition  "goal"
                     :alert_first_only false
                     :alert_above_goal false}}
            "with data"
            {:card
             (merge (pulse.test-util/checkins-query-card {:filter   [:between $date "2014-02-12" "2014-02-17"]
                                                          :breakout [!day.date]})
                    {:visualization_settings {:graph.show_goal  true
                                              :graph.goal_value 1.1
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})
             :display :line

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:subject "Alert: Test card has gone below its goal"
                                             :message [{pulse.test-util/card-name true
                                                        "This question has gone below its goal of 1\\.1\\." true}
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/png-attachment
                                                       pulse.test-util/csv-attachment]})
                       (mt/summarize-multipart-single-email email test-card-regex
                                                            #"This question has gone below its goal of 1\.1\."))))}}

            "with no satisfying data"
            {:card
             (merge (pulse.test-util/checkins-query-card {:filter   [:between $date "2014-02-10" "2014-02-12"]
                                                          :breakout [!day.date]})
                    {:visualization_settings {:graph.show_goal  true
                                              :graph.goal_value 1.1
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})
             :display :bar

             :assert
             {:email
              (fn [_ emails]
                (is (empty? emails)))}}

            "with progress bar"
            {:card
             (merge (pulse.test-util/venues-query-card "min")
                    {:display                :progress
                     :visualization_settings {:graph.show_goal  true
                                              :progress.goal    2
                                              :graph.dimensions ["DATE"]
                                              :graph.metrics    ["count"]}})

             :assert
             {:email
              (fn [_ [email]]
                (is (= (rasta-alert-message {:subject "Alert: Test card has gone below its goal"})
                       (mt/summarize-multipart-single-email email test-card-regex))))}})))

(deftest ^:parallel goal-met-test
  (let [alert-above-pulse {:send_condition "goal_above"}
        alert-below-pulse {:send_condition "goal_below"}
        progress-result   (fn [val] {:card   {:display                :progress
                                              :visualization_settings {:progress.goal    5}}
                                     :result {:data {:rows [[val]]}}})
        timeseries-result (fn [val] {:card   {:display                :bar
                                              :visualization_settings {:graph.goal_value 5}}
                                     :result {:data {:cols [{:source :breakout}
                                                            {:name           "avg"
                                                             :source         :aggregation
                                                             :base_type      :type/Integer
                                                             :effective-type :type/Integer
                                                             :semantic_type  :type/Quantity}]
                                                     :rows [["2021-01-01T00:00:00Z" val]]}}})
        goal-met?           (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
    (testing "Progress bar"
      (testing "alert above"
        (testing "value below goal"  (is (false? (goal-met? alert-above-pulse (progress-result 4)))))
        (testing "value equals goal" (is (true? (goal-met? alert-above-pulse (progress-result 5)))))
        (testing "value above goal"  (is (true? (goal-met? alert-above-pulse (progress-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (true? (goal-met? alert-below-pulse (progress-result 4)))))
        (testing "value equals goal (#10899)" (is (false? (goal-met? alert-below-pulse (progress-result 5)))))
        (testing "value above goal"  (is (false? (goal-met? alert-below-pulse (progress-result 6)))))))
    (testing "Timeseries"
      (testing "alert above"
        (testing "value below goal"  (is (false? (goal-met? alert-above-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (true? (goal-met? alert-above-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (true? (goal-met? alert-above-pulse (timeseries-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (true? (goal-met? alert-below-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (false? (goal-met? alert-below-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (false? (goal-met? alert-below-pulse (timeseries-result 6)))))))))

(deftest native-query-with-user-specified-axes-test
  (testing "Native query with user-specified x and y axis"
    (mt/with-temp [:model/Card {card-id :id} {:name                   "Test card"
                                              :dataset_query          {:database (mt/id)
                                                                       :type     :native
                                                                       :native   {:query (str "select count(*) as total_per_day, date as the_day "
                                                                                              "from checkins "
                                                                                              "group by date")}}
                                              :display                :line
                                              :visualization_settings {:graph.show_goal  true
                                                                       :graph.goal_value 5.9
                                                                       :graph.dimensions ["THE_DAY"]
                                                                       :graph.metrics    ["TOTAL_PER_DAY"]}}]
      (with-pulse-for-card [{pulse-id :id} {:card card-id, :pulse {:alert_condition  "goal"
                                                                   :alert_first_only false
                                                                   :alert_above_goal true}}]
        (let [channel-messages (pulse.test-util/with-captured-channel-send-messages!
                                 (pulse.send/send-pulse! (models.pulse/retrieve-notification pulse-id)))]
          (is (= (rasta-alert-message {:subject "Alert: Test card has reached its goal"})
                 (mt/summarize-multipart-single-email (-> channel-messages :channel/email first) test-card-regex))))))))

(deftest nonuser-email-test
  (testing "Both users and Nonusers get an email, with unsubscribe text for nonusers"
    (notification.tu/with-send-notification-sync
      (mt/with-temp [:model/Card                  {card-id :id} {:name          "Test card"
                                                                 :dataset_query {:database (mt/id)
                                                                                 :type     :native
                                                                                 :native   {:query "select * from checkins"}}
                                                                 :display       :table}
                     :model/Pulse                 {pulse-id :id} {:name            "Pulse Name"
                                                                  :alert_condition "rows"}
                     :model/PulseCard             _ {:pulse_id pulse-id
                                                     :card_id  card-id}
                     :model/PulseChannel          {pc-id :id} {:pulse_id pulse-id
                                                               :details  {:emails ["nonuser@metabase.com"]}}
                     :model/PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
                                                     :pulse_channel_id pc-id}]
        (pulse.test-util/email-test-setup!
         (pulse.send/send-pulse! (models.pulse/retrieve-notification pulse-id))
         (is (mt/received-email-body? :rasta #"Manage your subscriptions"))
         (is (mt/received-email-body? "nonuser@metabase.com" #"Unsubscribe")))))))

(deftest partial-channel-failure-will-deliver-all-that-success-test
  (testing "if a pulse is set to send to multiple channels and one of them fail, the other channels should still receive the message"
    (notification.tu/with-send-notification-sync
      (mt/with-temp
        [:model/Card         {card-id :id}  (pulse.test-util/checkins-query-card {:breakout [!day.date]
                                                                                  :limit    1})
         :model/Pulse        {pulse-id :id} {:name "Test Pulse"
                                             :alert_condition "rows"}
         :model/PulseCard    _              {:pulse_id pulse-id
                                             :card_id  card-id}
         :model/PulseChannel _              {:pulse_id pulse-id
                                             :channel_type "email"
                                             :details      {:emails ["foo@metabase.com"]}}
         :model/PulseChannel _              {:pulse_id     pulse-id
                                             :channel_type "slack"
                                             :details      {:channel "#general"}}]
        (let [original-render-noti (var-get #'channel/render-notification)]
          (with-redefs [channel/render-notification (fn [& args]
                                                      (if (= :channel/slack (first args))
                                                        (throw (ex-info "Slack failed" {}))
                                                        (apply original-render-noti args)))]
            ;; slack failed but email should still be sent
            (is (= {:channel/email 1}
                   (update-vals
                    (pulse.test-util/with-captured-channel-send-messages!
                      (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id)))
                    count)))))))))

(deftest alert-send-to-channel-e2e-test
  (testing "Send alert to http channel works e2e"
    (let [requests (atom [])
          endpoint (channel.http-test/make-route
                    :post "/test"
                    (fn [req]
                      (swap! requests conj req)
                      {:status 200
                       :body   "ok"}))]
      (mt/with-temporary-setting-values [http-channel-host-strategy :allow-all]
        (notification.tu/with-notification-testing-setup!
          (channel.http-test/with-server [url [endpoint]]
            (mt/with-temp
              [:model/Card         card           {:dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}
               :model/Channel      channel        {:type    :channel/http
                                                   :details {:url         (str url "/test")
                                                             :auth-method :none}}
               :model/Pulse        {pulse-id :id} {:name "Test Pulse"
                                                   :alert_condition "rows"}
               :model/PulseCard    _              {:pulse_id pulse-id
                                                   :card_id  (:id card)}
               :model/PulseChannel _              {:pulse_id pulse-id
                                                   :channel_type "http"
                                                   :channel_id   (:id channel)}]
              (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))
              (is (=? {:body {:alert_creator_id   (mt/user->id :rasta)
                              :alert_creator_name "Rasta Toucan"
                              :alert_id           pulse-id
                              :data               {:question_id   (:id card)
                                                   :question_name (mt/malli=? string?)
                                                   :question_url  (mt/malli=? string?)
                                                   :raw_data      {:cols ["count"], :rows [[18760]]},
                                                   :type          "question"
                                                   :visualization (mt/malli=? [:fn #(str/starts-with? % "data:image/png;base64,")])}
                              :type               "alert"}}
                      (first @requests))))))))))

(deftest do-not-send-alert-with-archived-card-test
  (mt/with-temp
    [:model/Card         {card-id :id}  {:archived      true
                                         :dataset_query (mt/mbql-query orders {:limit 1})}
     :model/Pulse        {pulse-id :id} {:name            "Test Pulse"
                                         :alert_condition "rows"}
     :model/PulseCard    _              {:pulse_id pulse-id
                                         :card_id  card-id}
     :model/PulseChannel _              {:pulse_id pulse-id
                                         :channel_type "email"
                                         :details      {:emails ["foo@metabase.com"]}}]
    (is (empty? (-> (pulse.test-util/with-captured-channel-send-messages!
                      (pulse.send/send-pulse! (models.pulse/retrieve-notification pulse-id)))
                    :channel/email)))))

(deftest send-skip-alert-test
  (testing "alerts are skipped (#63189)"
    (let [pulse-sent-called? (atom false)]
      (with-redefs [pulse.send/send-pulse!* (fn [& _args])]
        (mt/with-temp [:model/Pulse {pulse-id :id
                                     :as pulse}   {:creator_id      (mt/user->id :rasta)
                                                   :name            (mt/random-name)
                                                   :alert_condition "rows"}
                       :model/PulseChannel _      {:pulse_id       pulse-id
                                                   :channel_type   :slack
                                                   :enabled        true
                                                   :details        {:channel "#random"}}]
          (pulse.send/send-pulse! pulse)
          (is (false? @pulse-sent-called?)))))))
