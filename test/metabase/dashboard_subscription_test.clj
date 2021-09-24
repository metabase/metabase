(ns metabase.dashboard-subscription-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard PulseChannel PulseChannelRecipient User]]
            [metabase.models.pulse :as models.pulse]
            [metabase.pulse :as pulse]
            [metabase.pulse.render.body :as render.body]
            [metabase.pulse.test-util :refer :all]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]))

(defn- do-with-dashboard-sub-for-card
  "Creates a Pulse, Dashboard, and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if
  specified), then invokes

    (f pulse)"
  [{:keys [dashboard pulse pulse-card channel card]
    :or   {channel :email}}
   f]
  (mt/with-temp* [Pulse         [{pulse-id :id, :as pulse}
                                 (->> pulse
                                      (merge {:name         "Aviary KPIs"
                                              :dashboard_id (u/the-id dashboard)}))]
                  PulseCard     [_ (merge {:pulse_id pulse-id
                                           :card_id  (u/the-id card)
                                           :position 0}
                                          pulse-card)]
                  DashboardCard [{dashcard-id :id} {:dashboard_id (u/the-id dashboard)
                                                    :card_id (u/the-id card)}]
                  PulseChannel  [{pc-id :id} (case channel
                                               :email
                                               {:pulse_id pulse-id}

                                               :slack
                                               {:pulse_id     pulse-id
                                                :channel_type "slack"
                                                :details      {:channel "#general"}})]]
    (if (= channel :email)
      (mt/with-temp PulseChannelRecipient [_ {:user_id          (rasta-id)
                                              :pulse_channel_id pc-id}]
        (f pulse))
      (f pulse))))

(defmacro ^:private with-dashboard-sub-for-card
  "e.g.

    (with-dashboard-sub-for-card [pulse {:card my-card, :pulse pulse-properties, ...}]
      ...)"
  [[pulse-binding properties] & body]
  `(do-with-dashboard-sub-for-card ~properties (fn [~pulse-binding] ~@body)))

(defn- do-test
  "Run a single Pulse test with a standard set of boilerplate. Creates Card, Pulse, and other related objects using
  `card`, `dashboard`, `pulse`, and `pulse-card` properties, then sends the Pulse; finally, test assertions in
  `assert` are invoked.  `assert` can contain `:email` and/or `:slack` assertions, which are used to test an email and
  Slack version of that Pulse respectively. `:assert` functions have the signature

    (f object-ids send-pulse!-response)

  Example:

    (do-test
     {:card   {:dataset_query (mt/mbql-query checkins)}
      :assert {:slack (fn [{:keys [pulse-id]} response]
                        (is (= {:sent pulse-id}
                               response)))}})"
  [{:keys [card dashboard pulse pulse-card fixture], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack) assertions)]}
  (doseq [channel-type [:email :slack]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (mt/with-temp* [Dashboard     [{dashboard-id :id} (->> dashboard
                                                             (merge {:name "Aviary KPIs"
                                                                     :description "How are the birds doing today?"}))]
                      Card          [{card-id :id} (merge {:name card-name} card)]]
        (with-dashboard-sub-for-card [{pulse-id :id}
                                      {:card       card-id
                                       :creator_id (mt/user->id :rasta)
                                       :dashboard  dashboard-id
                                       :pulse      pulse
                                       :pulse-card pulse-card
                                       :channel    channel-type}]
          (letfn [(thunk* []
                    (f {:dashboard-id dashboard-id,
                        :card-id card-id,
                        :pulse-id pulse-id}
                       (pulse/send-pulse! (models.pulse/retrieve-notification pulse-id))))
                  (thunk []
                    (if fixture
                      (fixture {:dashboard-id dashboard-id,
                                :card-id card-id,
                                :pulse-id pulse-id} thunk*)
                      (thunk*)))]
            (case channel-type
              :email (email-test-setup (thunk))
              :slack (slack-test-setup (thunk)))))))))

(defn- tests
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
      (do-test (merge-with merge common m)))))

(defn- rasta-pulse-email [& [email]]
  (mt/email-to :rasta (merge {:subject "Aviary KPIs",
                              :body  [{"Aviary KPIs" true}
                                      png-attachment]}
                             email)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Tests                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest execute-dashboard-test
  (testing "it runs for each non-virtual card"
    (mt/with-temp* [Card          [{card-id-1 :id}]
                    Card          [{card-id-2 :id}]
                    Dashboard     [{dashboard-id :id} {:name "Birdfeed Usage"}]
                    DashboardCard [dashcard-1 {:dashboard_id dashboard-id :card_id card-id-1}]
                    DashboardCard [dashcard-2 {:dashboard_id dashboard-id :card_id card-id-2}]
                    User [{user-id :id}]]
      (let [result (pulse/execute-dashboard {:creator_id user-id} dashboard-id)]
        (is (= (count result) 2))
        (is (schema= [{:card     (s/pred map?)
                       :dashcard (s/pred map?)
                       :result   (s/pred map?)}]
                     result)))))
  (testing "dashboard cards are ordered correctly -- by rows, and then by columns (#17419)"
    (mt/with-temp* [Card          [{card-id-1 :id}]
                    Card          [{card-id-2 :id}]
                    Card          [{card-id-3 :id}]
                    Dashboard     [{dashboard-id :id} {:name "Birdfeed Usage"}]
                    DashboardCard [dashcard-1 {:dashboard_id dashboard-id :card_id card-id-1 :row 1 :col 0}]
                    DashboardCard [dashcard-2 {:dashboard_id dashboard-id :card_id card-id-2 :row 0 :col 1}]
                    DashboardCard [dashcard-3 {:dashboard_id dashboard-id :card_id card-id-3 :row 0 :col 0}]
                    User [{user-id :id}]]
      (let [result (pulse/execute-dashboard {:creator_id user-id} dashboard-id)]
        (is (= [card-id-3 card-id-2 card-id-1]
               (map #(-> % :card :id) result))))))
  (testing "virtual (text) cards are returned as a viz settings map"
    (mt/with-temp* [Card          [{card-id-1 :id}]
                    Card          [{card-id-2 :id}]
                    Dashboard     [{dashboard-id :id} {:name "Birdfeed Usage"}]
                    DashboardCard [dashcard-1 {:dashboard_id dashboard-id
                                               :visualization_settings {:virtual_card {}, :text "test"}}]
                    User [{user-id :id}]]
      (is (= [{:virtual_card {}, :text "test"}] (pulse/execute-dashboard {:creator_id user-id} dashboard-id))))))

(deftest basic-table-test
  (tests {:pulse {:skip_if_empty false}}
    "9 results, so no attachment aside from dashboard icon"
    {:card (checkins-query-card {:aggregation nil, :limit 9})

     :fixture
     (fn [_ thunk]
       (with-redefs [render.body/attached-results-text (wrap-function @#'render.body/attached-results-text)]
         (thunk)))

     :assert
     {:email
      (fn [_ _]
        (is (= (rasta-pulse-email
                {:body [{;; No "Pulse:" prefix
                         "Aviary KPIs" true
                         ;; Includes dashboard description
                         "How are the birds doing today?" true
                         ;; Includes name of subscription creator
                         "Sent by Rasta Toucan" true
                         ;; Includes everything
                         "More results have been included" false
                         ;; Inline table
                         "ID</th>" true
                         ;; Links to source dashboard
                         "<a class=\\\"title\\\" href=\\\"https://metabase.com/testmb/dashboard/\\d+\\\"" true
                         ;; Links to Metabase instance
                         "Sent from <a href=\\\"https://metabase.com/testmb\\\"" true
                         ;; Links to subscription management page in account settings
                         "\\\"https://metabase.com/testmb/account/notifications\\\"" true
                         "Manage your subscriptions" true}
                        png-attachment]})
               (mt/summarize-multipart-email
                #"Aviary KPIs"
                #"How are the birds doing today?"
                #"Sent by Rasta Toucan"
                #"More results have been included"
                #"ID</th>"
                #"<a class=\"title\" href=\"https://metabase.com/testmb/dashboard/\d+\""
                #"Sent from <a href=\"https://metabase.com/testmb\""
                #"\"https://metabase.com/testmb/account/notifications\""
                #"Manage your subscriptions"))))
      :slack
      (fn [{:keys [card-id dashboard-id]} [pulse-results]]
        ;; If we don't force the thunk, the rendering code will never execute and attached-results-text won't be
        ;; called
        (testing "\"more results in attachment\" text should not be present for Slack Pulses"
          (testing "Pulse results"
            (is (= {:channel-id "#general"
                    :attachments
                    [{:blocks [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                               {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                     {:title           card-name
                      :rendered-info   {:attachments false
                                        :content     true}
                      :title_link      (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name "image.png"
                      :channel-id      "FOO"
                      :fallback        card-name}
                     {:blocks [{:type "divider"}
                               {:type "context"
                                :elements [{:type "mrkdwn"
                                            :text (str "<https://metabase.com/testmb/dashboard/"
                                                       dashboard-id
                                                       "|*Sent from Metabase Test*>")}]}]}]}
                   (thunk->boolean pulse-results))))
          (testing "attached-results-text should be invoked exactly once"
            (is (= 1
                   (count (input @#'render.body/attached-results-text)))))
          (testing "attached-results-text should return nil since it's a slack message"
            (is (= [nil]
                   (output @#'render.body/attached-results-text))))))}}))

(deftest virtual-card-test
  (tests {:pulse {:skip_if_empty false}}
    "Dashboard subscription that includes a virtual (markdown) card"
    {:card (checkins-query-card {})

     :fixture
     (fn [{dashboard-id :dashboard-id} thunk]
       (mt/with-temp DashboardCard [_ {:dashboard_id dashboard-id, :visualization_settings {:text "# header"}}]
         (thunk)))

     :assert
     {:email
       (fn [_ _]
         (testing "Markdown cards are included in email subscriptions"
           (is (= (rasta-pulse-email {:body [{"Aviary KPIs" true
                                              "header"      true}
                                             png-attachment]})
                  (mt/summarize-multipart-email #"Aviary KPIs"
                                                #"header")))))

       :slack
       (fn [{:keys [card-id dashboard-id]} [pulse-results]]
         (testing "Markdown cards are included in attachments list as :blocks sublists, and markdown is
                  converted to mrkdwn (Slack markup language)"
           (is (= {:channel-id "#general"
                   :attachments
                   [{:blocks [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                              {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                    {:title           card-name
                     :rendered-info   {:attachments false, :content true, :render/text true},
                     :title_link      (str "https://metabase.com/testmb/question/" card-id)
                     :attachment-name "image.png"
                     :channel-id      "FOO"
                     :fallback        card-name}
                    {:blocks [{:type "section" :text {:type "mrkdwn" :text "*header*"}}]}
                    {:blocks [{:type "divider"}
                              {:type "context"
                               :elements [{:type "mrkdwn"
                                           :text (str "<https://metabase.com/testmb/dashboard/"
                                                      dashboard-id
                                                      "|*Sent from Metabase Test*>")}]}]}]}
                  (thunk->boolean pulse-results)))))}}))

(deftest dashboard-filter-test
  (tests {:pulse     {:skip_if_empty false}
          :dashboard test-dashboard}
    "Dashboard subscription that includes a dashboard filters"
    {:card (checkins-query-card {})

     :assert
     {:email
       (fn [_ _]
         (testing "Markdown cards are included in email subscriptions"
           (is (= (rasta-pulse-email {:body [{"Aviary KPIs" true
                                              "<a class=\\\"title\\\" href=\\\"https://metabase.com/testmb/dashboard/\\d+\\?state=CA&amp;state=NY&amp;quarter_and_year=Q1-2021\\\"" true}
                                             png-attachment]})
                  (mt/summarize-multipart-email #"Aviary KPIs"
                                                #"<a class=\"title\" href=\"https://metabase.com/testmb/dashboard/\d+\?state=CA&amp;state=NY&amp;quarter_and_year=Q1-2021\"")))))

      :slack
      (fn [{:keys [card-id dashboard-id]} [pulse-results]]
        (testing "Markdown cards are included in attachments list as :blocks sublists, and markdown is
                  converted to mrkdwn (Slack markup language)"
          (is (= {:channel-id "#general"
                  :attachments
                  [{:blocks [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                             {:type "section",
                              :fields [{:type "mrkdwn", :text "*State*\nCA, NY"}
                                       {:type "mrkdwn", :text "*Quarter and Year*\nQ1-2021"}]}
                             {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                   {:title           card-name
                    :rendered-info   {:attachments false, :content true, :render/text true},
                    :title_link      (str "https://metabase.com/testmb/question/" card-id)
                    :attachment-name "image.png"
                    :channel-id      "FOO"
                    :fallback        card-name}
                   {:blocks [{:type "divider"}
                             {:type "context"
                              :elements [{:type "mrkdwn"
                                          :text (str "<https://metabase.com/testmb/dashboard/"
                                                     dashboard-id
                                                     "?state=CA&state=NY&quarter_and_year=Q1-2021|*Sent from Metabase Test*>")}]}]}]}
                 (thunk->boolean pulse-results)))))}}))

(deftest mrkdwn-length-limit-test
  (tests {:pulse {:skip_if_empty false}}
    "Dashboard subscription that includes a Markdown card that exceeds Slack's length limit when converted to mrkdwn"
    {:card (checkins-query-card {})

     :fixture
     (fn [{dashboard-id :dashboard-id} thunk]
       (mt/with-temp DashboardCard [_ {:dashboard_id dashboard-id, :visualization_settings {:text "abcdefghijklmnopqrstuvwxyz"}}]
         (binding [pulse/*slack-mrkdwn-length-limit* 10]
           (thunk))))

     :assert
     {:slack
      (fn [{:keys [card-id]} [pulse-results]]
        (is (= {:blocks [{:type "section" :text {:type "mrkdwn" :text "abcdefghi…"}}]}
               (nth (:attachments (thunk->boolean pulse-results)) 2))))}}))
