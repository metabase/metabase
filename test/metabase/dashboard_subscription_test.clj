(ns metabase.dashboard-subscription-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.integrations.slack :as slack]
            [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard PulseChannel PulseChannelRecipient User]]
            [metabase.models.pulse :as models.pulse]
            [metabase.pulse :as pulse]
            [metabase.pulse.render.body :as render.body]
            [metabase.pulse.test-util :refer :all]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- do-with-dashboard-sub-for-card
  "Creates a Pulse, Dashboard, and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if
  specified), then invokes

    (f pulse)"
  [{:keys [dashboard pulse pulse-card channel card]
    :or   {channel :email}}
   f]
  (mt/with-temp* [Pulse         [{pulse-id :id, :as pulse}
                                 (-> pulse
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
  [{:keys [card pulse pulse-card fixture], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack) assertions)]}
  (doseq [channel-type [:email :slack]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Aviary KPIs"}]
                      Card          [{card-id :id} (merge {:name card-name} card)]]
        (with-dashboard-sub-for-card [{pulse-id :id}
                                      {:card       card-id
                                       :dashboard  dashboard-id
                                       :pulse      pulse
                                       :pulse-card pulse-card
                                       :channel    channel-type}]
          (letfn [(thunk* []
                    (f {:card-id card-id, :pulse-id pulse-id}
                       (pulse/send-pulse! (models.pulse/retrieve-notification pulse-id))))
                  (thunk []
                    (if fixture
                      (fixture {:card-id card-id, :pulse-id pulse-id} thunk*)
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
  (testing "it runs for each card"
    (mt/with-temp* [Card          [{card-id-1 :id}]
                    Card          [{card-id-2 :id}]
                    Dashboard     [{dashboard-id :id} {:name "Birdfeed Usage"}]
                    DashboardCard [dashcard-1 {:dashboard_id dashboard-id :card_id card-id-1}]
                    DashboardCard [dashcard-2 {:dashboard_id dashboard-id :card_id card-id-2}]
                    User [{user-id :id}]]
      (let [result (pulse/execute-dashboard {:creator_id user-id} dashboard-id)]
        (is (= (count result) 2))
        (is (schema= [{:card   (s/pred map?)
                       :result (s/pred map?)}]
                     result))))))

(deftest basic-table-test
  (tests {:pulse {:skip_if_empty false}}
    "19 results, so no attachment"
    {:card (checkins-query-card {:aggregation nil, :limit 19})

     :fixture
     (fn [_ thunk]
       (with-redefs [render.body/attached-results-text (wrap-function @#'render.body/attached-results-text)]
         (thunk)))

     :assert
     {:email
      (fn [_ _]
        (is (= (rasta-pulse-email {:body [{;; No "Pulse:" prefix
                                           "Aviary KPIs"                     true
                                           ;; Includes everything
                                           "More results have been included" false
                                           ;; Inline table
                                           "ID</th>"                         true
                                           ;; Links to source dashboard
                                           "<a href=\\\"https://metabase.com/testmb/dashboard/\\d+\\\" class=\\\"title-link\\\">" true}]})
               (mt/summarize-multipart-email
                #"Aviary KPIs"
                #"More results have been included"
                #"ID</th>"
                #"<a href=\"https://metabase.com/testmb/dashboard/\d+\" class=\"title-link\">"))))

      :slack
      (fn [{:keys [card-id]} [pulse-results]]
        ;; If we don't force the thunk, the rendering code will never execute and attached-results-text won't be
        ;; called
        (force-bytes-thunk pulse-results)
        (testing "\"more results in attachment\" text should not be present for Slack Pulses"
          (testing "Pulse results"
            (is (= {:channel-id "#general"
                    :message    "Aviary KPIs"
                    :attachments
                    [{:title                  card-name
                      :attachment-bytes-thunk true
                      :title_link             (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name        "image.png"
                      :channel-id             "FOO"
                      :fallback               card-name}]}
                   (thunk->boolean pulse-results))))
          (testing "attached-results-text should be invoked exactly once"
            (is (= 1
                   (count (input @#'render.body/attached-results-text)))))
          (testing "attached-results-text should return nil since it's a slack message"
            (is (= [nil]
                   (output @#'render.body/attached-results-text))))))}}))
