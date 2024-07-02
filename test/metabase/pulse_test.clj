(ns metabase.pulse-test
  "These are mostly Alerts test, dashboard subscriptions could be found in
  [[metabase.dashboard-subscription-test]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.email :as email]
   [metabase.integrations.slack :as slack]
   [metabase.models
    :refer [Card Collection Pulse PulseCard PulseChannel PulseChannelRecipient]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.pulse :as pulse]
   [metabase.pulse]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.body :as body]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.retry :as retry]
   [metabase.util.retry-test :as rt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Util Fns & Macros                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-alert-message
  [& [data]]
  (merge {:subject      "Alert: Test card has results"
          :recipients   #{"rasta@metabase.com"}
          :message-type :attachments,
          :message      [{pulse.test-util/card-name true}
                         ;; card static-viz
                         pulse.test-util/png-attachment
                         ;; icon
                         pulse.test-util/png-attachment]}
         data))

(defn do-with-pulse-for-card
  "Creates a Pulse and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if specified), then
  invokes

    (f pulse)"
  [{:keys [pulse pulse-card channel card]
    :or   {channel :email}}
   f]
  (mt/with-temp [Pulse        {pulse-id :id, :as pulse} (->> pulse
                                                             (merge {:name            "Pulse Name"
                                                                     :alert_condition "rows"}))
                 PulseCard    _ (merge {:pulse_id        pulse-id
                                        :card_id         (u/the-id card)
                                        :position        0}

                                       pulse-card)
                 PulseChannel {pc-id :id} (case channel
                                            :email
                                            {:pulse_id pulse-id}

                                            :slack
                                            {:pulse_id     pulse-id
                                             :channel_type "slack"
                                             :details      {:channel "#general"}})]
    (if (= channel :email)
      (t2.with-temp/with-temp [PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
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
  [{:keys [card pulse pulse-card display fixture], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack) assertions)]}
  (doseq [channel-type [:email :slack]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (mt/with-temp [Card          {card-id :id} (merge {:name    pulse.test-util/card-name
                                                         :display (or display :line)}
                                                        card)]
        (with-pulse-for-card [{pulse-id :id}
                              {:card       card-id
                               :pulse      pulse
                               :pulse-card pulse-card
                               :channel    channel-type}]
          (letfn [(thunk* []
                    (f {:card-id card-id, :pulse-id pulse-id}
                       ((if (= :email channel-type)
                          :channel/email
                          :channel/slack)
                        (pulse.test-util/with-captured-channel-send-messages!
                          (mt/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
                            (metabase.pulse/send-pulse! (t2/select-one :model/Pulse pulse-id)))))))
                  (thunk []
                    (if fixture
                      (fixture {:card-id card-id, :pulse-id pulse-id} thunk*)
                      (thunk*)))]
            (case channel-type
              :email (thunk)
              :slack (pulse.test-util/slack-test-setup! (thunk)))))))))

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
  {:style/indent 1}
  [common & {:as message->m}]
  (doseq [[message m] message->m]
    (testing message
      (do-test! (merge-with merge common m)))))

(def ^:private test-card-result {pulse.test-util/card-name true})
(def ^:private test-card-regex (re-pattern pulse.test-util/card-name))


(defn- produces-bytes? [{:keys [rendered-info]}]
  (when rendered-info
    (pos? (alength (or (render/png-from-render-info rendered-info 500)
                       (byte-array 0))))))

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
     (fn [{:keys [card-id]} [pulse-results]]
      (is (= {:channel-id "#general"
              :attachments
              [{:blocks [{:type "header", :text {:type "plain_text", :text "🔔 Test card", :emoji true}}]}
               {:title           pulse.test-util/card-name
                :rendered-info   {:attachments false
                                  :content     true}
                :title_link      (str "https://metabase.com/testmb/question/" card-id)
                :attachment-name "image.png"
                :channel-id      "FOO"
                :fallback        pulse.test-util/card-name}]}
             (pulse.test-util/thunk->boolean pulse-results))))}}))

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
                                                "<a href=\\\"https://metabase.com/testmb/dashboard/" false}
                                               pulse.test-util/png-attachment]})
               (mt/summarize-multipart-single-email
                email
                test-card-regex
                #"More results have been included"
                #"ID</th>"
                #"<a href=\"https://metabase.com/testmb/dashboard/"))))

      :slack
      (fn [{:keys [card-id]} [pulse-results]]
        (testing "\"more results in attachment\" text should not be present for Slack Pulses"
          (testing "Pulse results"
            (is (= {:channel-id "#general"
                    :attachments
                    [{:blocks
                       [{:type "header", :text {:type "plain_text", :text "🔔 Test card", :emoji true}}]}
                     {:title           pulse.test-util/card-name
                      :rendered-info   {:attachments false
                                        :content     true}
                      :title_link      (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name "image.png"
                      :channel-id      "FOO"
                      :fallback        pulse.test-util/card-name}]}
                   (pulse.test-util/thunk->boolean pulse-results))))
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
                                               pulse.test-util/png-attachment]})
               (mt/summarize-multipart-single-email
                email
                test-card-regex
                #"More results have been included" #"ID</th>"))))}}))

(deftest csv-test
  (tests! {:pulse {}
           :card  (merge
                   (pulse.test-util/checkins-query-card {:breakout [!day.date]})
                   {:visualization_settings {:graph.dimensions ["DATE"]
                                             :graph.metrics    ["count"]}})}
    "alert with a CSV"
    {:pulse-card {:include_csv true}

     :assert
     {:email
      (fn [_ [email]]
        (is (= (rasta-alert-message {:message [test-card-result
                                               pulse.test-util/png-attachment
                                               pulse.test-util/png-attachment
                                               pulse.test-util/csv-attachment]})
               (mt/summarize-multipart-single-email email test-card-regex))))}}

    "With a \"rows\" type of pulse (table visualization) we should not include the CSV by default, per issue #36441"
    {:card {:display :table :dataset_query (mt/mbql-query checkins)}

     :assert
     {:email
      (fn [_ [email]]
        ;; There's no PNG with a table visualization, so only assert on one png (the dashboard icon)
        (is (= (rasta-alert-message {:message [{pulse.test-util/card-name true} pulse.test-util/png-attachment]})
               (mt/summarize-multipart-single-email email test-card-regex))))}}))

(deftest xls-test
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
(deftest xls-test-2
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
        (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results           10000
                                                                            :max-results-bare-rows 30})]
          (thunk)))
      :pulse-card {:include_csv true}
      :assert
      {:email
       (fn [_ [email]]
         (is (= true (some? email))
             "Should have a message in the inbox")
         (when email
           (let [filename (-> email :message last :content)
                 exists?  (some-> filename io/file .exists)]
             (testing "File should exist"
               (is (= true
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
        (t2.with-temp/with-temp [PulseChannelRecipient _ {:user_id          (mt/user->id :crowberto)
                                                          :pulse_channel_id (t2/select-one-pk PulseChannel :pulse_id pulse-id)}]
          (thunk)))

      :assert
      {:email
       (fn [_ [email]]
         (is (= (rasta-alert-message {:recipients #{"rasta@metabase.com" "crowberto@metabase.com"}})
                (mt/summarize-multipart-single-email email test-card-regex))))}})))

;; this should be in dashboard subscriptions
#_(deftest empty-results-test
    (testing "Pulse where the card has no results"
      (tests! {:card (assoc (pulse.test-util/checkins-query-card {:filter   [:> $date "2017-10-24"]
                                                                  :breakout [!day.date]})
                           :visualization_settings {:graph.dimensions ["DATE"]
                                                    :graph.metrics    ["count"]})}
        "skip if empty = false"
        {:pulse    {:skip_if_empty false}
         :assert {:email (fn [_ [email]]
                             (is (= (rasta-alert-email-2)
                                    (mt/summarize-multipart-single-email email test-card-regex))))}}

        "skip if empty = true"
        {:pulse    {:skip_if_empty true}
         :assert {:email (fn [_ emails]
                             (is (empty? emails)))}})))

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
                                                 pulse.test-util/png-attachment]})
                 (mt/summarize-multipart-single-email email test-card-regex #"More results have been included"))))

        :slack
        (fn [{:keys [card-id]} [result]]
          (is (= {:channel-id  "#general",
                  :attachments [{:blocks [{:type "header", :text {:type "plain_text", :text "🔔 Test card", :emoji true}}]}
                                {:title           pulse.test-util/card-name
                                 :rendered-info   {:attachments false
                                                   :content     true}
                                 :title_link      (str "https://metabase.com/testmb/question/" card-id)
                                 :attachment-name "image.png"
                                 :channel-id      "FOO"
                                 :fallback        pulse.test-util/card-name}]}
                 (pulse.test-util/thunk->boolean result)))
          (is (every? produces-bytes? (rest (:attachments result)))))}}

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
                                                 pulse.test-util/png-attachment]})
                 (mt/summarize-multipart-single-email email test-card-regex
                                                      #"More results have been included"
                                                      #"ID</th>"))))}}

      "with data and a CSV + XLS attachment"
      {:card
       (merge
        (pulse.test-util/checkins-query-card {:breakout [!day.date]})
        {:visualization_settings {:graph.dimensions ["DATE"]
                                  :graph.metrics    ["count"]}})

       :pulse-card {:include_csv true, :include_xls true}

       :assert
       {:email
        (fn [_ [email]]
          (is (= (rasta-alert-message {:message [test-card-result
                                                 pulse.test-util/png-attachment
                                                 pulse.test-util/png-attachment
                                                 pulse.test-util/csv-attachment
                                                 pulse.test-util/xls-attachment]})
                 (mt/summarize-multipart-single-email email test-card-regex))))}})))

(deftest alert-first-run-only-test
  (tests! {:pulse {:alert_condition "rows", :alert_first_only true}}
    "first run only with data"
    {:card
     (merge
      (pulse.test-util/checkins-query-card {:breakout [!day.date]})
      {:visualization_settings {:graph.dimensions ["DATE"]
                                :graph.metrics    ["count"]}})

     :assert
     {:email
      (fn [{pulse-id :pulse-id} [email]]
        (is (= (rasta-alert-message)
               (mt/summarize-multipart-single-email email test-card-regex))) ;#"stop sending you alerts")))
        (testing "Pulse should be deleted"
          (is (= false
                 (t2/exists? Pulse :id pulse-id)))))}}

    "first run alert with no data"
    {:card
     (pulse.test-util/checkins-query-card {:filter   [:> $date "2017-10-24"]
                                           :breakout [!day.date]})

     :assert
     {:email
      (fn [{:keys [pulse-id]} emails]
        (is (empty? emails))
        (testing "Pulse should still exist"
          (is (= true
                 (t2/exists? Pulse :id pulse-id)))))}}))

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
          (is (= (rasta-alert-message {:subject "Alert: Test card has reached its goal"})
                 (mt/summarize-multipart-single-email email test-card-regex))))}}

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
          (is (= (rasta-alert-message {:subject "Alert: Test card has gone below its goal"})
                 (mt/summarize-multipart-single-email email test-card-regex))))}}

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
  (let [alert-above-pulse {:alert_above_goal true}
        alert-below-pulse {:alert_above_goal false}
        progress-result   (fn [val] [{:card   {:display                :progress
                                               :visualization_settings {:progress.goal    5}}
                                      :result {:data {:rows [[val]]}}}])
        timeseries-result (fn [val] [{:card   {:display                :bar
                                               :visualization_settings {:graph.goal_value 5}}
                                      :result {:data {:cols [{:source :breakout}
                                                             {:name           "avg"
                                                              :source         :aggregation
                                                              :base_type      :type/Integer
                                                              :effective-type :type/Integer
                                                              :semantic_type  :type/Quantity}]
                                                      :rows [["2021-01-01T00:00:00Z" val]]}}}])
        goal-met?         (fn [pulse [first-result]] (#'metabase.pulse/goal-met? pulse [first-result]))]
    (testing "Progress bar"
      (testing "alert above"
        (testing "value below goal"  (is (= false (goal-met? alert-above-pulse (progress-result 4)))))
        (testing "value equals goal" (is (=  true (goal-met? alert-above-pulse (progress-result 5)))))
        (testing "value above goal"  (is (=  true (goal-met? alert-above-pulse (progress-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (=  true (goal-met? alert-below-pulse (progress-result 4)))))
        (testing "value equals goal (#10899)" (is (= false (goal-met? alert-below-pulse (progress-result 5)))))
        (testing "value above goal"  (is (= false (goal-met? alert-below-pulse (progress-result 6)))))))
    (testing "Timeseries"
      (testing "alert above"
        (testing "value below goal"  (is (= false (goal-met? alert-above-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (=  true (goal-met? alert-above-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (=  true (goal-met? alert-above-pulse (timeseries-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (=  true (goal-met? alert-below-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (= false (goal-met? alert-below-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (= false (goal-met? alert-below-pulse (timeseries-result 6)))))))))

(deftest native-query-with-user-specified-axes-test
  (testing "Native query with user-specified x and y axis"
    (t2.with-temp/with-temp [Card {card-id :id} {:name                   "Test card"
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
        (let [channel-messsages (pulse.test-util/with-captured-channel-send-messages!
                                  (metabase.pulse/send-pulse! (pulse/retrieve-notification pulse-id)))]
          (is (= (rasta-alert-message {:subject "Alert: Test card has reached its goal"})
                 (mt/summarize-multipart-single-email (-> channel-messsages :channel/email first) test-card-regex))))))))

;; TODO should be in dashboard subscription test
#_(deftest dashboard-description-markdown-test
    (testing "Dashboard description renders markdown"
      (mt/with-temp [Card                  {card-id :id} {:name          "Test card"
                                                          :dataset_query {:database (mt/id)
                                                                          :type     :native
                                                                          :native   {:query "select * from checkins"}}
                                                          :display       :table}
                     Dashboard             {dashboard-id :id} {:description "# dashboard description"}
                     DashboardCard         {dashboard-card-id :id} {:dashboard_id dashboard-id
                                                                    :card_id      card-id}
                     Pulse                 {pulse-id :id} {:name         "Pulse Name"
                                                           :dashboard_id dashboard-id}
                     PulseCard             _ {:pulse_id          pulse-id
                                              :card_id           card-id
                                              :dashboard_card_id dashboard-card-id}
                     PulseChannel          {pc-id :id} {:pulse_id pulse-id}
                     PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
                                              :pulse_channel_id pc-id}]
          (pulse.test-util/email-test-setup
           (metabase.pulse/send-pulse! (pulse/retrieve-notification pulse-id))
           (is (= (mt/email-to :rasta {:subject "Pulse Name"
                                       :body    {"<h1>dashboard description</h1>" true}
                                       :bcc?    true})
                  (mt/regex-email-bodies #"<h1>dashboard description</h1>")))))))

(deftest nonuser-email-test
  (testing "Both users and Nonusers get an email, with unsubscribe text for nonusers"
    (mt/with-temp [Card                  {card-id :id} {:name          "Test card"
                                                        :dataset_query {:database (mt/id)
                                                                        :type     :native
                                                                        :native   {:query "select * from checkins"}}
                                                        :display       :table}
                   Pulse                 {pulse-id :id} {:name            "Pulse Name"
                                                         :alert_condition "rows"}
                   PulseCard             _ {:pulse_id pulse-id
                                            :card_id  card-id}
                   PulseChannel          {pc-id :id} {:pulse_id pulse-id
                                                      :details  {:emails ["nonuser@metabase.com"]}}
                   PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
                                            :pulse_channel_id pc-id}]
      (pulse.test-util/email-test-setup
       (metabase.pulse/send-pulse! (pulse/retrieve-notification pulse-id))
       (is (mt/received-email-body? :rasta #"Manage your subscriptions"))
       (is (mt/received-email-body? "nonuser@metabase.com" #"Unsubscribe"))))))

(deftest pulse-permissions-test
  (testing "Pulses should be sent with the Permissions of the user that created them."
    (letfn [(send-pulse-created-by-user!* [user-kw]
              (mt/with-temp [Collection coll {}
                             Card       card {:dataset_query (mt/mbql-query checkins
                                                                            {:order-by [[:asc $id]]
                                                                             :limit    1})
                                              :collection_id (:id coll)}]
                (perms/revoke-collection-permissions! (perms-group/all-users) coll)
                (pulse.test-util/send-pulse-created-by-user! user-kw card)))]
      (is (= [[1 "2014-04-07T00:00:00Z" 5 12]]
             (send-pulse-created-by-user!* :crowberto)))
      (testing "If the current user doesn't have permissions to execute the Card for a Pulse, an Exception should be thrown."
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You do not have permissions to view Card [\d,]+."
             (send-pulse-created-by-user!* :rasta)))))))

(defn- get-positive-retry-metrics [^io.github.resilience4j.retry.Retry retry]
  (let [metrics (bean (.getMetrics retry))]
    (into {}
          (map (fn [field]
                 (let [n (metrics field)]
                   (when (pos? n)
                     [field n]))))
          [:numberOfFailedCallsWithRetryAttempt
           :numberOfFailedCallsWithoutRetryAttempt
           :numberOfSuccessfulCallsWithRetryAttempt
           :numberOfSuccessfulCallsWithoutRetryAttempt])))

(def ^:private fake-email-notification
  {:subject      "test-message"
   :recipients   ["whoever@example.com"]
   :message-type :text
   :message      "test message body"})

(defn ^:private test-retry-configuration
  []
  (assoc (#'retry/retry-configuration)
         :initial-interval-millis 1))

(deftest email-notification-retry-test
  (testing "send email succeeds w/o retry"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" (test-retry-configuration))]
      (with-redefs [email/send-email! mt/fake-inbox-email-fn
                    retry/decorate    (rt/test-retry-decorate-fn test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'metabase.pulse/send-retrying! :channel/email fake-email-notification)
          (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 1 (count @mt/inbox)))))))
  (testing "send email succeeds hiding SMTP host not set error"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" (test-retry-configuration))]
      (with-redefs [email/send-email! (fn [& _] (throw (ex-info "Bumm!" {:cause :smtp-host-not-set})))
                    retry/decorate    (rt/test-retry-decorate-fn test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'metabase.pulse/send-retrying! :channel/email fake-email-notification)
          (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 0 (count @mt/inbox)))))))
  (testing "send email fails b/c retry limit"
    (let [retry-config (assoc (test-retry-configuration) :max-attempts 1)
          test-retry (retry/random-exponential-backoff-retry "test-retry" retry-config)]
      (with-redefs [email/send-email! (tu/works-after 1 mt/fake-inbox-email-fn)
                    retry/decorate    (rt/test-retry-decorate-fn test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'metabase.pulse/send-retrying! :channel/email fake-email-notification)
          (is (= {:numberOfFailedCallsWithRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 0 (count @mt/inbox)))))))
  (testing "send email succeeds w/ retry"
    (let [retry-config (assoc (test-retry-configuration) :max-attempts 2)
          test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
        (with-redefs [email/send-email! (tu/works-after 1 mt/fake-inbox-email-fn)
                      retry/decorate    (rt/test-retry-decorate-fn test-retry)]
          (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                             email-smtp-port 587]
            (mt/reset-inbox!)
            (#'metabase.pulse/send-retrying! :channel/email fake-email-notification)
            (is (= {:numberOfSuccessfulCallsWithRetryAttempt 1}
                   (get-positive-retry-metrics test-retry)))
            (is (= 1 (count @mt/inbox))))))))

(def ^:private fake-slack-notification
  {:channel-id  "#test-channel"
   :message     "test message body"
   :attachments []})

(deftest slack-notification-retry-test
  (testing "post slack message succeeds w/o retry"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" (test-retry-configuration))]
      (with-redefs [slack/post-chat-message! (constantly nil)
                    retry/decorate           (rt/test-retry-decorate-fn test-retry)]
        (#'metabase.pulse/send-retrying! :channel/slack fake-slack-notification)
        (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
               (get-positive-retry-metrics test-retry))))))
  (testing "post slack message succeeds hiding token error"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" (test-retry-configuration))]
      (with-redefs [slack/post-chat-message! (fn [& _]
                                               (throw (ex-info "Invalid token"
                                                               {:errors {:slack-token "Invalid token"}})))
                    retry/decorate           (rt/test-retry-decorate-fn test-retry)]
        (#'metabase.pulse/send-retrying! :channel/slack fake-slack-notification)
        (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
               (get-positive-retry-metrics test-retry))))))
  (testing "post slack message fails b/c retry limit"
   (let [retry-config (assoc (test-retry-configuration) :max-attempts 1)
         test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
     (with-redefs [slack/post-chat-message! (tu/works-after 1 (constantly nil))
                   retry/decorate           (rt/test-retry-decorate-fn test-retry)]
       (#'metabase.pulse/send-retrying! :channel/slack fake-slack-notification)
       (is (= {:numberOfFailedCallsWithRetryAttempt 1}
              (get-positive-retry-metrics test-retry))))))
  (testing "post slack message succeeds with retry"
   (let [retry-config (assoc (test-retry-configuration) :max-attempts 2)
         test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
     (with-redefs [slack/post-chat-message! (tu/works-after 1 (constantly nil))
                   retry/decorate           (rt/test-retry-decorate-fn test-retry)]
         (#'metabase.pulse/send-retrying! :channel/slack fake-slack-notification)
         (is (= {:numberOfSuccessfulCallsWithRetryAttempt 1}
                (get-positive-retry-metrics test-retry)))))))

(deftest alerts-do-not-remove-user-metadata
  (testing "Alerts that exist on a Model shouldn't remove metadata (#35091)."
    (mt/dataset test-data
      (let [q               {:database (mt/id)
                             :type     :query
                             :query
                             {:source-table (mt/id :reviews)
                              :aggregation  [[:count]]}}
            result-metadata [{:base_type         :type/Integer
                              :name              "count"
                              :display_name      "ASDF Count"
                              :description       "ASDF Some description"
                              :semantic_type     :type/Quantity
                              :source            :aggregation
                              :field_ref         [:aggregation 0]
                              :aggregation_index 0}]]
        (mt/with-temp [Card {card-id :id} {:display         :table
                                           :dataset_query   q
                                           :type            :model
                                           :result_metadata result-metadata}
                       Pulse {pulse-id :id :as p} {:name "Test Pulse" :alert_condition "rows"}
                       PulseCard _ {:pulse_id pulse-id
                                    :card_id  card-id}
                       PulseChannel _ {:channel_type :email
                                       :pulse_id     pulse-id
                                       :enabled      true}]
          (metabase.pulse/send-pulse! p)
          (testing "The custom columns defined in the result-metadata (:display_name and :description) are still present after the alert has run."
              (is (= (-> result-metadata
                         first
                         (select-keys [:display_name :description]))
                     (t2/select-one-fn
                      (comp #(select-keys % [:display_name :description]) first :result_metadata)
                      :model/Card :id card-id)))))))))
