(ns metabase.dashboard-subscription-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.email.messages :as messages]
   [metabase.models
    :refer [Card
            Collection
            Dashboard
            DashboardCard
            Database
            Pulse
            PulseCard
            PulseChannel
            PulseChannelRecipient
            Table
            User]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.pulse :as pulse]
   [metabase.public-settings :as public-settings]
   [metabase.pulse]
   [metabase.pulse.render.body :as body]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- do-with-dashboard-sub-for-card
  "Creates a Pulse, Dashboard, and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if
  specified), then invokes

    (f pulse)"
  [{:keys [dashboard pulse pulse-card channel card dashcard]
    :or   {channel :email}}
   f]
  (mt/with-temp [Pulse         {pulse-id :id, :as pulse} (merge {:name         "Aviary KPIs"
                                                                 :dashboard_id (u/the-id dashboard)}
                                                                pulse)
                 PulseCard     _ (merge {:pulse_id pulse-id
                                         :card_id  (u/the-id card)
                                         :position 0}
                                        pulse-card)
                 DashboardCard _ (merge {:dashboard_id (u/the-id dashboard)
                                         :row          0
                                         :card_id      (u/the-id card)}
                                        dashcard)
                 PulseChannel  {pc-id :id} (case channel
                                             :email
                                             {:pulse_id pulse-id}

                                             :slack
                                             {:pulse_id     pulse-id
                                              :channel_type "slack"
                                              :details      {:channel "#general"}})]
    (if (= channel :email)
      (mt/with-temp [PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
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
  [{:keys [card dashboard dashcard pulse pulse-card fixture display], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack) assertions)]}
  (doseq [channel-type [:email :slack]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (mt/with-temp [Dashboard     {dashboard-id :id} (->> dashboard
                                                           (merge {:name "Aviary KPIs"
                                                                   :description "How are the birds doing today?"}))
                     Card          {card-id :id} (merge {:name pulse.test-util/card-name
                                                         :display (or display :line)} card)]
        (with-dashboard-sub-for-card [{pulse-id :id}
                                      {:card       card-id
                                       :creator_id (mt/user->id :rasta)
                                       :dashboard  dashboard-id
                                       :dashcard   dashcard
                                       :pulse      pulse
                                       :pulse-card pulse-card
                                       :channel    channel-type}]
          (letfn [(thunk* []
                    (f {:dashboard-id dashboard-id,
                        :card-id card-id,
                        :pulse-id pulse-id}
                       (metabase.pulse/send-pulse! (pulse/retrieve-notification pulse-id))))
                  (thunk []
                    (if fixture
                      (fixture {:dashboard-id dashboard-id,
                                :card-id card-id,
                                :pulse-id pulse-id} thunk*)
                      (thunk*)))]
            (case channel-type
              :email (pulse.test-util/email-test-setup (thunk))
              :slack (pulse.test-util/slack-test-setup (thunk)))))))))

(defn- tests
  "Convenience for writing multiple tests using [[do-test]]. `common` is a map of shared properties as passed
  to [[do-test]] that is deeply merged with the individual maps for each test. Other args are alternating `testing`
  context messages and properties as passed to [[do-test]]:

    (tests
     ;; shared properties used for both tests
     {:card {:dataset_query (mt/mbql-query)}}

     \"Test 1\"
     {:assert {:email (fn [_object-ids _response] (is ...))}}

     \"Test 2\"
     ;; override just the :display property of the Card
     {:card   {:display \"table\"}
      :assert {:email (fn [_object-ids _response] (is ...))}})"
  {:style/indent 1}
  [common & {:as message->m}]
  (doseq [[message m] message->m]
    (testing message
      (do-test (merge-with merge common m)))))

(defn- rasta-pulse-email [& [email]]
  (mt/email-to :rasta (merge {:subject "Aviary KPIs"
                              :body    [{"Aviary KPIs" true}
                                        pulse.test-util/png-attachment]
                              :bcc?    true}
                             email)))

(defn do-with-dashboard-fixture-for-dashboard
  "Impl for [[with-link-card-fixture-for-dashboard]]."
  [dashboard thunk]
  (let [dashboard-id          (:id dashboard)
        link-card-viz-setting (fn [model id]
                                {:virtual_card {:display "link"}
                                 :link         {:entity {:id    id
                                                         :model model}}})
        rasta-id              (mt/user->id :rasta)
        rasta-pc-id           (t2/select-one-fn :id Collection :personal_owner_id rasta-id)]
    (t2.with-temp/with-temp
      [Collection    {coll-id :id}      {:name        "Linked collection name"
                                         :description "Linked collection desc"
                                         :location    (format "/%d/" rasta-pc-id)}
       Database      {db-id :id}        {:name        "Linked database name"
                                         :description "Linked database desc"}
       Table         {table-id :id}     {:db_id        db-id
                                         :name        "Linked table name"
                                         :display_name "Linked table dname"
                                         :description "Linked table desc"}
       Card          {card-id :id}      {:name          "Linked card name"
                                         :description   "Linked card desc"
                                         :display       "bar"
                                         :collection_id coll-id}
       Card          {model-id :id}     {:dataset       true
                                         :name          "Linked model name"
                                         :description   "Linked model desc"
                                         :display       "table"
                                         :collection_id coll-id}
       Dashboard     {dash-id :id}      {:name          "Linked Dashboard name"
                                         :description   "Linked Dashboard desc"
                                         :collection_id coll-id}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    1
                                         :visualization_settings (link-card-viz-setting "collection" coll-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    2
                                         :visualization_settings (link-card-viz-setting "database" db-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    3
                                         :visualization_settings (link-card-viz-setting "table" table-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    4
                                         :visualization_settings (link-card-viz-setting "dashboard" dash-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    5
                                         :visualization_settings (link-card-viz-setting "card" card-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    6
                                         :visualization_settings (link-card-viz-setting "dataset" model-id)}
       DashboardCard _                  {:dashboard_id           dashboard-id
                                         :row                    7
                                         :visualization_settings {:virtual_card {:display "link"}
                                                                  :link         {:url "https://metabase.com"}}}]
      (thunk {:collection-owner-id rasta-id
              :collection-id       coll-id
              :database-id         db-id
              :table-id            table-id
              :card-id             card-id
              :model-id            model-id
              :dashboard-id        dash-id
              :url                 "https://metabase.com"}))))

(defmacro with-link-card-fixture-for-dashboard
  "Given a dashboard, prepare a list of linkcards that connected to it and execute the body."
  {:style/indent 2}
  [dashboard [binding] & body]
  `(do-with-dashboard-fixture-for-dashboard
     ~dashboard
     (fn [~binding] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Tests                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel execute-dashboard-test
  (testing "it runs for each non-virtual card"
    (mt/with-temp [Card          {card-id-1 :id} {}
                   Card          {card-id-2 :id} {}
                   Dashboard     {dashboard-id :id, :as dashboard} {:name "Birdfeed Usage"}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-1}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-2}
                   User {user-id :id} {}]
      (let [result (@#'metabase.pulse/execute-dashboard {:creator_id user-id} dashboard)]
        (is (malli= [:sequential
                     {:min 2, :max 2}
                     [:map
                      [:card     :map]
                      [:dashcard :map]
                      [:result   :map]
                      [:type     [:= :card]]]]
                    result))))))

(deftest ^:parallel execute-dashboard-test-2
  (testing "hides empty card when card.hide_empty is true"
    (mt/with-temp [Card          {card-id-1 :id} {}
                   Card          {card-id-2 :id} {}
                   Dashboard     {dashboard-id :id, :as dashboard} {:name "Birdfeed Usage"}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-1}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-2 :visualization_settings {:card.hide_empty true}}
                   User {user-id :id} {}]
      (let [result (@#'metabase.pulse/execute-dashboard {:creator_id user-id} dashboard)]
        (is (= (count result) 1))))))

(deftest ^:parallel execute-dashboard-test-3
  (testing "dashboard cards are ordered correctly -- by rows, and then by columns (#17419)"
    (mt/with-temp [Card          {card-id-1 :id} {}
                   Card          {card-id-2 :id} {}
                   Card          {card-id-3 :id} {}
                   Dashboard     {dashboard-id :id, :as dashboard} {:name "Birdfeed Usage"}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-1 :row 1 :col 0}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-2 :row 0 :col 1}
                   DashboardCard _ {:dashboard_id dashboard-id :card_id card-id-3 :row 0 :col 0}
                   User {user-id :id} {}]
      (let [result (@#'metabase.pulse/execute-dashboard {:creator_id user-id} dashboard)]
        (is (= [card-id-3 card-id-2 card-id-1]
               (map #(-> % :card :id) result)))))))

(deftest ^:parallel execute-dashboard-test-4
  (testing "virtual (text) cards are returned as a viz settings map"
    (mt/with-temp [Card          _ {}
                   Card          _ {}
                   Dashboard     {dashboard-id :id, :as dashboard} {:name "Birdfeed Usage"}
                   DashboardCard _ {:dashboard_id dashboard-id
                                    :visualization_settings {:virtual_card {}, :text "test"}}
                   User {user-id :id} {}]
      (is (= [{:virtual_card {} :text "test" :type :text}]
             (@#'metabase.pulse/execute-dashboard {:creator_id user-id} dashboard))))))

(deftest basic-table-test
  (tests {:pulse {:skip_if_empty false} :display :table}
    "9 results, so no attachment aside from dashboard icon"
    {:card (pulse.test-util/checkins-query-card {:aggregation nil, :limit 9})

     :fixture
     (fn [_ thunk]
       (with-redefs [body/attached-results-text (pulse.test-util/wrap-function @#'body/attached-results-text)]
         (mt/with-temporary-setting-values [site-name "Metabase Test"]
           (thunk))))

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
                        pulse.test-util/png-attachment]})
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
                     {:title           pulse.test-util/card-name
                      :rendered-info   {:attachments false
                                        :content     true}
                      :title_link      (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name "image.png"
                      :channel-id      "FOO"
                      :fallback        pulse.test-util/card-name}
                     {:blocks [{:type "divider"}
                               {:type "context"
                                :elements [{:type "mrkdwn"
                                            :text (str "<https://metabase.com/testmb/dashboard/"
                                                       dashboard-id
                                                       "|*Sent from Metabase Test*>")}]}]}]}
                   (pulse.test-util/thunk->boolean pulse-results))))
          (testing "attached-results-text should be invoked exactly once"
            (is (= 1
                   (count (pulse.test-util/input @#'body/attached-results-text)))))
          (testing "attached-results-text should return nil since it's a slack message"
            (is (= [nil]
                   (pulse.test-util/output @#'body/attached-results-text))))))}}))

(deftest virtual-card-test
  (tests {:pulse {:skip_if_empty false}, :dashcard {:row 0, :col 0}}
    "Dashboard subscription that includes a virtual (markdown) card"
    {:card (pulse.test-util/checkins-query-card {})

     :fixture
     (fn [{dashboard-id :dashboard-id} thunk]
       (t2.with-temp/with-temp [DashboardCard _ {:dashboard_id dashboard-id
                                                 :row 1
                                                 :col 1
                                                 :visualization_settings {:text "# header"}}]
         (mt/with-temporary-setting-values [site-name "Metabase Test"]
           (thunk))))

     :assert
     {:email
      (fn [_ _]
        (testing "Markdown cards are included in email subscriptions"
          (is (= (rasta-pulse-email {:body [{"Aviary KPIs" true
                                             "header"      true}
                                            pulse.test-util/png-attachment]})
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
                   {:title           pulse.test-util/card-name
                    :rendered-info   {:attachments false, :content true, :render/text true},
                    :title_link      (str "https://metabase.com/testmb/question/" card-id)
                    :attachment-name "image.png"
                    :channel-id      "FOO"
                    :fallback        pulse.test-util/card-name}
                   {:blocks [{:type "section" :text {:type "mrkdwn" :text "*header*"}}]}
                   {:blocks [{:type "divider"}
                             {:type "context"
                              :elements [{:type "mrkdwn"
                                          :text (str "<https://metabase.com/testmb/dashboard/"
                                                     dashboard-id
                                                     "|*Sent from Metabase Test*>")}]}]}]}
                 (pulse.test-util/thunk->boolean pulse-results)))))}}))

(deftest virtual-card-heading-test
  (tests {:pulse {:skip_if_empty false}, :dashcard {:row 0, :col 0}}
         "Dashboard subscription that includes a virtual card. For heading cards we escape markdown, add a heading markdown, and don't subsitute tags."
         {:card (pulse.test-util/checkins-query-card {})

          :fixture
          (fn [{dashboard-id :dashboard-id} thunk]
            (t2.with-temp/with-temp [DashboardCard _ {:dashboard_id dashboard-id
                                                      :row 1
                                                      :col 1
                                                      :visualization_settings {:text "# header, quote isn't escaped" :virtual_card {:display "heading"}}}]
              (mt/with-temporary-setting-values [site-name "Metabase Test"]
                (thunk))))

          :assert
          {:email
           (fn [_ _]
             (testing "Markdown cards are included in email subscriptions"
               (is (= (rasta-pulse-email {:body [{"Aviary KPIs"                 true
                                                  "header, quote isn't escaped" true}
                                                 pulse.test-util/png-attachment]})
                      (mt/summarize-multipart-email #"Aviary KPIs"
                                                    #"header, quote isn't escaped")))))

           :slack
           (fn [{:keys [card-id dashboard-id]} [pulse-results]]
             (testing "Markdown cards are included in attachments list as :blocks sublists, and markdown isn't
                  converted to mrkdwn (Slack markup language)"
               (is (= {:channel-id "#general"
                       :attachments
                       [{:blocks [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                                  {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                        {:title           pulse.test-util/card-name
                         :rendered-info   {:attachments false, :content true, :render/text true},
                         :title_link      (str "https://metabase.com/testmb/question/" card-id)
                         :attachment-name "image.png"
                         :channel-id      "FOO"
                         :fallback        pulse.test-util/card-name}
                        {:blocks [{:type "section" :text {:type "mrkdwn" :text "*# header, quote isn't escaped*"}}]}
                        {:blocks [{:type "divider"}
                                  {:type "context"
                                   :elements [{:type "mrkdwn"
                                               :text (str "<https://metabase.com/testmb/dashboard/"
                                                          dashboard-id
                                                          "|*Sent from Metabase Test*>")}]}]}]}
                      (pulse.test-util/thunk->boolean pulse-results)))))}}))

(deftest dashboard-filter-test
  (with-redefs [metabase.pulse/attachment-text-length-limit 15]
    (tests {:pulse     {:skip_if_empty false}
            :dashboard pulse.test-util/test-dashboard}
      "Dashboard subscription that includes a dashboard filters"
      {:card (pulse.test-util/checkins-query-card {})

       :fixture
       (fn [_ thunk]
         (mt/with-temporary-setting-values [site-name "Metabase Test"]
           (thunk)))

       :assert
       {:email
        (fn [_ _]
          (testing "Markdown cards are included in email subscriptions"
            (is (= (rasta-pulse-email {:body [{"Aviary KPIs" true
                                               "<a class=\\\"title\\\" href=\\\"https://metabase.com/testmb/dashboard/\\d+\\?state=CA&amp;state=NY&amp;state=NJ&amp;quarter_and_year=Q1-2021\\\"" true}
                                              pulse.test-util/png-attachment]})
                   (mt/summarize-multipart-email #"Aviary KPIs"
                                                 #"<a class=\"title\" href=\"https://metabase.com/testmb/dashboard/\d+\?state=CA&amp;state=NY&amp;state=NJ&amp;quarter_and_year=Q1-2021\"")))))

        :slack
        (fn [{:keys [card-id dashboard-id]} [pulse-results]]
          (testing "Markdown cards are included in attachments list as :blocks sublists, and markdown is
                  converted to mrkdwn (Slack markup language) and truncated appropriately"
            (is (= {:channel-id "#general"
                    :attachments
                    [{:blocks [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                               {:type "section",
                                :fields [{:type "mrkdwn", :text "*State*\nCA, NY…"}  ;; "*State*\nCA, NY and NJ"
                                         {:type "mrkdwn", :text "*Quarter and Y…"}]} ;; "*Quarter and Year*\nQ1, 2021"
                               {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                     {:title           pulse.test-util/card-name
                      :rendered-info   {:attachments false, :content true, :render/text true},
                      :title_link      (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name "image.png"
                      :channel-id      "FOO"
                      :fallback        pulse.test-util/card-name}
                     {:blocks [{:type "divider"}
                               {:type "context"
                                :elements [{:type "mrkdwn"
                                            :text (str "<https://metabase.com/testmb/dashboard/"
                                                       dashboard-id
                                                       "?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021|*Sent from Metabase Test*>")}]}]}]}
                   (pulse.test-util/thunk->boolean pulse-results)))))}})))

(deftest dashboard-with-link-card-test
  (tests {:pulse     {:skip_if_empty false}
          :dashboard pulse.test-util/test-dashboard}
   "Dashboard that has link cards should render correctly"
   {:card    (pulse.test-util/checkins-query-card {})

    :fixture
    (fn [{dashboard-id :dashboard-id} thunk]
      (mt/with-temporary-setting-values [site-name "Metabase Test"]
        (with-link-card-fixture-for-dashboard (t2/select-one Dashboard :id dashboard-id) [_]
          (thunk))))
    :assert
    {:email
     (fn [_ _]
       (is (every?
             true?
             (-> (mt/summarize-multipart-email
                   #"https://metabase\.com/testmb/collection/\d+"
                   #"Linked collection name"
                   #"Linked collection desc"

                   #"https://metabase\.com/testmb/browse/\d+"
                   #"Linked database name"
                   #"Linked database desc"

                   #"https://metabase\.com/testmb/question\?db=\d+&amp;table=\d+"
                   #"Linked table dname"
                   #"Linked table desc"

                   #"https://metabase\.com/testmb/question/\d+"
                   #"Linked card name"
                   #"Linked card desc"

                   #"https://metabase\.com/testmb/question/\d+"
                   #"Linked model name"
                   #"Linked model desc"

                   #"https://metabase\.com/testmb/dashboard/\d+"
                   #"Linked Dashboard name"
                   #"Linked Dashboard desc")
                 (get "rasta@metabase.com")
                 first
                 :body
                 first
                 vals))))

     :slack
     (fn [_ [pulse-results]]
       (is (=? {:channel-id "#general",
                :attachments
                [{:blocks
                  [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                   {:type "section",
                    :fields
                    [{:type "mrkdwn", :text "*State*\nCA, NY, and NJ"}
                     {:type "mrkdwn", :text "*Quarter and Year*\nQ1, 2021"}]}
                   {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                 {:title "Test card",
                  :rendered-info {:attachments false, :content true, :render/text true},
                  :title_link #"https://metabase.com/testmb/question/.+",
                  :attachment-name "image.png",
                  :channel-id "FOO",
                  :fallback "Test card"}
                 {:blocks
                  [{:type "section",
                    :text
                    {:type "mrkdwn",
                     :text #"\*<https://metabase\.com/testmb/collection/\d+\|Linked collection name>\*\nLinked collection desc"}}]}
                 {:blocks
                  [{:type "section",
                    :text
                    {:type "mrkdwn", :text #"\*<https://metabase\.com/testmb/browse/\d+\|Linked database name>\*\nLinked database desc"}}]}
                 {:blocks
                  [{:type "section",
                    :text
                    {:type "mrkdwn",
                     :text #"\*<https://metabase\.com/testmb/question\?db=\d+&table=\d+\|Linked table dname>\*\nLinked table desc"}}]}
                 {:blocks
                  [{:type "section",
                    :text
                    {:type "mrkdwn",
                     :text #"\*<https://metabase\.com/testmb/dashboard/\d+\|Linked Dashboard name>\*\nLinked Dashboard desc"}}]}
                 {:blocks
                  [{:type "section",
                    :text {:type "mrkdwn", :text #"\*<https://metabase\.com/testmb/question/\d+\|Linked card name>\*\nLinked card desc"}}]}
                 {:blocks
                  [{:type "section",
                    :text
                    {:type "mrkdwn", :text #"\*<https://metabase\.com/testmb/question/\d+\|Linked model name>\*\nLinked model desc"}}]}
                 {:blocks
                  [{:type "section", :text {:type "mrkdwn", :text "*<https://metabase.com|https://metabase.com>*"}}]}
                 {:blocks
                  [{:type "divider"}
                   {:type "context",
                    :elements
                    [{:type "mrkdwn",
                      :text
                      #"<https://metabase\.com/testmb/dashboard/\d+\?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021\|\*Sent from Metabase Test\*>"}]}]}]}
               (pulse.test-util/thunk->boolean pulse-results))))}}))

(deftest mrkdwn-length-limit-test
  (with-redefs [metabase.pulse/block-text-length-limit 10]
    (tests {:pulse {:skip_if_empty false}, :dashcard {:row 0, :col 0}}
      "Dashboard subscription that includes a Markdown card that exceeds Slack's length limit when converted to mrkdwn"
      {:card (pulse.test-util/checkins-query-card {})

       :fixture
       (fn [{dashboard-id :dashboard-id} thunk]
         (t2.with-temp/with-temp [DashboardCard _ {:dashboard_id dashboard-id
                                                   :row 1
                                                   :col 1
                                                   :visualization_settings {:text "abcdefghijklmnopqrstuvwxyz"}}]
           (thunk)))

       :assert
       {:slack
        (fn [_object-ids [pulse-results]]
          (is (= {:blocks [{:type "section" :text {:type "mrkdwn" :text "abcdefghi…"}}]}
                 (nth (:attachments (pulse.test-util/thunk->boolean pulse-results)) 2))))}})))

(deftest archived-dashboard-test
  (tests {:dashboard {:archived true}}
    "Dashboard subscriptions are not sent if dashboard is archived"
    {:card (pulse.test-util/checkins-query-card {})

     :assert
     {:slack
      (fn [_ [pulse-results]]
        (is (= {:attachments []} (pulse.test-util/thunk->boolean pulse-results))))

      :email
      (fn [_ _]
        (is (= {} (mt/summarize-multipart-email))))}}))

(deftest use-default-values-test
  (testing "Dashboard Subscriptions SHOULD use default values for Dashboard parameters when running (#20516)"
    (mt/dataset sample-dataset
      (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard} {:name       "20516 Dashboard"
                                                                            :parameters [{:name    "Category"
                                                                                          :slug    "category"
                                                                                          :id      "_MBQL_CATEGORY_"
                                                                                          :type    "category"
                                                                                          :default ["Doohickey"]}
                                                                                         {:name    "SQL Category"
                                                                                          :slug    "sql_category"
                                                                                          :id      "_SQL_CATEGORY_"
                                                                                          :type    "category"
                                                                                          :default ["Gizmo"]}]}]
        (testing "MBQL query"
          (mt/with-temp [Card {mbql-card-id :id} {:name          "Orders"
                                                  :dataset_query (mt/mbql-query products
                                                                                {:fields   [$id $title $category]
                                                                                 :order-by [[:asc $id]]
                                                                                 :limit    2})}
                         DashboardCard _ {:parameter_mappings [{:parameter_id "_MBQL_CATEGORY_"
                                                                :card_id      mbql-card-id
                                                                :target       [:dimension [:field (mt/id :products :category) nil]]}]
                                          :card_id            mbql-card-id
                                          :dashboard_id       dashboard-id}]
            (let [[mbql-results] (map :result (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard))]
              (is (= [[2 "Small Marble Shoes"        "Doohickey"]
                      [3 "Synergistic Granite Chair" "Doohickey"]]
                     (mt/rows mbql-results))))))
        (testing "SQL Query"
          (mt/with-temp [Card {sql-card-id :id} {:name          "Products (SQL)"
                                                 :dataset_query (mt/native-query
                                                                 {:query
                                                                  (str "SELECT id, title, category\n"
                                                                       "FROM products\n"
                                                                       "WHERE {{category}}\n"
                                                                       "ORDER BY id ASC\n"
                                                                       "LIMIT 2")

                                                                  :template-tags
                                                                  {"category"
                                                                   {:id           "_SQL_CATEGORY_TEMPLATE_TAG_"
                                                                    :name         "category"
                                                                    :display-name "Category"
                                                                    :type         :dimension
                                                                    :dimension    [:field (mt/id :products :category) nil]
                                                                    :widget-type  :category}}})}
                         DashboardCard _ {:parameter_mappings [{:parameter_id "_SQL_CATEGORY_"
                                                                :card_id      sql-card-id
                                                                :target       [:dimension [:template-tag "category"]]}]
                                          :card_id            sql-card-id
                                          :dashboard_id       dashboard-id}]
            (let [[results] (map :result (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard))]
              (is (= [[1  "Rustic Paper Wallet"   "Gizmo"]
                      [10 "Mediocre Wooden Table" "Gizmo"]]
                     (mt/rows results))))))))))

(deftest substitute-parameters-in-virtual-cards
  (testing "Parameters in virtual (text) cards should have parameter values substituted appropriately"
    (mt/with-temp [Dashboard {dashboard-id :id :as dashboard} {:name "Params in Text Card Test"
                                                               :parameters [{:name    "Category"
                                                                             :slug    "category"
                                                                             :id      "TEST_ID"
                                                                             :type    "category"
                                                                             :default ["Doohickey" "Gizmo"]}]}
                   DashboardCard _ {:parameter_mappings [{:parameter_id "TEST_ID"
                                                          :target       [:text-tag "foo"]}]
                                    :dashboard_id       dashboard-id
                                    :visualization_settings {:text "{{foo}}"}}]
      (is (= [{:text "Doohickey and Gizmo" :type :text}]
             (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard))))))

(deftest no-native-perms-test
  (testing "A native query on a dashboard executes succesfully even if the subscription creator does not have native
           query permissions (#28947)"
    (let [native-perm-path     [:groups (u/the-id (perms-group/all-users)) (mt/id) :data :native]
          original-native-perm (get-in (perms/data-perms-graph) native-perm-path)]
      (try
        (mt/with-temp [Dashboard {dashboard-id :id, :as dashboard} {:name "Dashboard"}
                       Card      {card-id :id} {:name          "Products (SQL)"
                                                :dataset_query (mt/native-query
                                                                {:query "SELECT * FROM venues LIMIT 1"})}
                       DashboardCard _ {:dashboard_id dashboard-id
                                        :card_id      card-id}]
          (perms/update-data-perms-graph! (assoc-in (perms/data-perms-graph) native-perm-path :none))
          (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]]
                 (-> (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard)
                     first :result :data :rows))))
        (finally
          (perms/update-data-perms-graph! (assoc-in (perms/data-perms-graph) native-perm-path original-native-perm)))))))

(deftest actions-are-skipped-test
  (testing "Actions should be filtered out"
    (t2.with-temp/with-temp
      [Dashboard     {dashboard-id :id
                      :as dashboard}   {:name "Dashboard"}
       DashboardCard _                 {:dashboard_id           dashboard-id
                                        :visualization_settings {:text "Markdown"}
                                        :row                    1}
       DashboardCard _                 {:dashboard_id           dashboard-id
                                        :visualization_settings {:virtual_card {:display "link"}
                                                                 :link         {:url "https://metabase.com"}}
                                        :row                    2}
       DashboardCard _                 {:dashboard_id           dashboard-id
                                        :visualization_settings {:virtual_card {:display "action"}}
                                        :row                    3}]
      (is (=? [{:text "Markdown"}
               {:text "### [https://metabase.com](https://metabase.com)"}]
             (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard)))))

  (testing "Link cards are returned and info should be newly fetched"
    (t2.with-temp/with-temp [Dashboard dashboard {:name "Test Dashboard"}]
      (with-link-card-fixture-for-dashboard dashboard [{:keys [collection-owner-id
                                                               collection-id
                                                               database-id
                                                               table-id
                                                               card-id
                                                               model-id
                                                               dashboard-id]}]
        (let [site-url (public-settings/site-url)]
          (testing "should returns all link cards and name are newly fetched"
            (doseq [[model id] [[Card card-id]
                                [Table table-id]
                                [Database database-id]
                                [Dashboard dashboard-id]
                                [Collection collection-id]
                                [Card model-id]]]
              (t2/update! model id {:name (format "New %s name" (name model))}))
            (is (=? [{:text (format "### [New Collection name](%s/collection/%d)\nLinked collection desc" site-url collection-id)}
                     {:text (format "### [New Database name](%s/browse/%d)\nLinked database desc" site-url database-id)}
                     {:text (format "### [Linked table dname](%s/question?db=%d&table=%d)\nLinked table desc" site-url database-id table-id)}
                     {:text (format "### [New Dashboard name](%s/dashboard/%d)\nLinked Dashboard desc" site-url dashboard-id)}
                     {:text (format "### [New Card name](%s/question/%d)\nLinked card desc" site-url card-id)}
                     {:text (format "### [New Card name](%s/question/%d)\nLinked model desc" site-url model-id)}
                     {:text (format "### [https://metabase.com](https://metabase.com)")}]
                    (@#'metabase.pulse/execute-dashboard {:creator_id collection-owner-id} dashboard))))

          (testing "it should filter out models that current users does not have permission to read"
            (is (=? [{:text (format "### [New Database name](%s/browse/%d)\nLinked database desc" site-url database-id)}
                     {:text (format "### [Linked table dname](%s/question?db=%d&table=%d)\nLinked table desc" site-url database-id table-id)}
                     {:text (format "### [https://metabase.com](https://metabase.com)")}]
                    (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :lucky)} dashboard)))))))))

(deftest execute-dashboard-with-tabs-test
  (t2.with-temp/with-temp
    [Dashboard           {dashboard-id :id
                          :as dashboard}   {:name "Dashboard"}
     :model/DashboardTab {tab-id-2 :id}    {:name         "The second tab"
                                            :position     1
                                            :dashboard_id dashboard-id}
     :model/DashboardTab {tab-id-1 :id}    {:name         "The first tab"
                                            :position     0
                                            :dashboard_id dashboard-id}
     DashboardCard       _                 {:dashboard_id           dashboard-id
                                            :dashboard_tab_id       tab-id-1
                                            :row                    2
                                            :visualization_settings {:text "Card 2 tab-1"}}
     DashboardCard       _                 {:dashboard_id           dashboard-id
                                            :dashboard_tab_id       tab-id-1
                                            :row                    1
                                            :visualization_settings {:text "Card 1 tab-1"}}
     DashboardCard       _                 {:dashboard_id           dashboard-id
                                            :dashboard_tab_id       tab-id-2
                                            :row                    2
                                            :visualization_settings {:text "Card 2 tab-2"}}
     DashboardCard       _                 {:dashboard_id           dashboard-id
                                            :dashboard_tab_id       tab-id-2
                                            :row                    1
                                            :visualization_settings {:text "Card 1 tab-2"}}]
    (testing "tabs are correctly rendered"
      (is (= [{:text "The first tab", :type :tab-title}
              {:text "Card 1 tab-1", :type :text}
              {:text "Card 2 tab-1", :type :text}
              {:text "The second tab", :type :tab-title}
              {:text "Card 1 tab-2", :type :text}
              {:text "Card 2 tab-2", :type :text}]
             (@#'metabase.pulse/execute-dashboard {:creator_id (mt/user->id :rasta)} dashboard))))))

(deftest render-dashboard-with-tabs-test
  (tests {:pulse     {:skip_if_empty false}
          :dashboard pulse.test-util/test-dashboard}
   "Dashboard that has link cards should render correctly"
   {:card    (pulse.test-util/checkins-query-card {})

    :fixture
    (fn [{dashboard-id :dashboard-id} thunk]
      (mt/with-temporary-setting-values [site-name "Metabase Test"]
        (t2.with-temp/with-temp
         [:model/DashboardTab {tab-id-2 :id}    {:name         "The second tab"
                                                 :position     1
                                                 :dashboard_id dashboard-id}
          :model/DashboardTab {tab-id-1 :id}    {:name         "The first tab"
                                                 :position     0
                                                 :dashboard_id dashboard-id}
          DashboardCard       _                 {:dashboard_id           dashboard-id
                                                 :dashboard_tab_id       tab-id-1
                                                 :row                    1
                                                 :visualization_settings {:text "Card 1 tab-1"}}
          DashboardCard       _                 {:dashboard_id           dashboard-id
                                                 :dashboard_tab_id       tab-id-1
                                                 :row                    2
                                                 :visualization_settings {:text "Card 2 tab-1"}}
          DashboardCard       _                 {:dashboard_id           dashboard-id
                                                 :dashboard_tab_id       tab-id-2
                                                 :row                    1
                                                 :visualization_settings {:text "Card 1 tab-2"}}
          DashboardCard       _                 {:dashboard_id           dashboard-id
                                                 :dashboard_tab_id       tab-id-2
                                                 :row                    2
                                                 :visualization_settings {:text "Card 2 tab-2"}}]
         ;; dashcards from this setup is currently not belong to any tabs, we should make sure them belong to one
         (t2/update! :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id nil {:dashboard_tab_id tab-id-1})
         (thunk))))
    :assert
    {:email
     (fn [_ _]
      (is (every?
            true?
            (-> (mt/summarize-multipart-email
                 #"The first tab"
                 #"Card 1 tab-1"
                 #"Card 2 tab-1"
                 #"The second tab"
                 #"Card 1 tab-2"
                 #"Card 2 tab-2")
                (get "rasta@metabase.com")
                first
                :body
                first
                vals))))

     :slack
     (fn [_ [pulse-results]]
       (is (=? {:channel-id "#general",
                :attachments
                [{:blocks
                  [{:type "header", :text {:type "plain_text", :text "Aviary KPIs", :emoji true}}
                   {:type "section",
                    :fields
                    [{:type "mrkdwn", :text "*State*\nCA, NY, and NJ"}
                     {:type "mrkdwn", :text "*Quarter and Year*\nQ1, 2021"}]}
                   {:type "section", :fields [{:type "mrkdwn", :text "Sent by Rasta Toucan"}]}]}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "*The first tab*"}}]}
                 {:title "Test card",
                  :rendered-info {:attachments false, :content true, :render/text true},
                  :title_link #"https://metabase.com/testmb/question/.+",
                  :attachment-name "image.png",
                  :channel-id "FOO",
                  :fallback "Test card"}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "Card 1 tab-1"}}]}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "Card 2 tab-1"}}]}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "*The second tab*"}}]}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "Card 1 tab-2"}}]}
                 {:blocks [{:type "section", :text {:type "mrkdwn", :text "Card 2 tab-2"}}]}
                 {:blocks
                  [{:type "divider"}
                   {:type "context",
                    :elements
                    [{:type "mrkdwn"
                      :text
                      #"<https://metabase\.com/testmb/dashboard/\d+\?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021\|\*Sent from Metabase Test\*>"}]}]}]}
               (pulse.test-util/thunk->boolean pulse-results))))}}))

(defn- result-attachment
  [{{{:keys [rows]} :data, :as result} :result}]
  (when (seq rows)
    [(let [^java.io.ByteArrayOutputStream baos (java.io.ByteArrayOutputStream.)]
       (with-open [os baos]
         (#'messages/stream-api-results-to-export-format :csv os result)
         (let [output-string (.toString baos "UTF-8")]
           {:type         :attachment
            :content-type :csv
            :content      output-string})))]))

(defn- metadata->field-ref
  [{:keys [name field_ref]} enabled?]
  {:name name :field_ref field_ref :enabled enabled?})

(deftest dashboard-subscription-attachments-test
  (testing "Dashboard subscription attachments respect dashcard viz settings."
    (mt/with-fake-inbox
      (mt/with-temp [Card {card-id :id :as c} (pulse.test-util/checkins-query-card {:breakout [!day.date]})
                     Dashboard     {dash-id :id} {:name "just dash"}]
        (let [;; with the helper `metadata->field-ref` we turn column metadata into column field refs
              ;; with an additional key `:enabled`. Here the 1st col is enabled, and the 2nd is disabled
              viz {:table.columns (mapv metadata->field-ref (:result_metadata c) [true false])}]
          (mt/with-temp [DashboardCard {dash-card-id :id} {:dashboard_id           dash-id
                                                           :card_id                card-id
                                                           :visualization_settings viz}
                         Pulse         {pulse-id :id, :as pulse}  {:name         "just pulse"
                                                                   :dashboard_id dash-id}
                         PulseCard     _ {:pulse_id          pulse-id
                                          :card_id           card-id
                                          :position          0
                                          :dashboard_card_id dash-card-id
                                          :include_csv       true}
                         PulseChannel  {pc-id :id} {:pulse_id pulse-id}
                         PulseChannelRecipient _ {:user_id          (pulse.test-util/rasta-id)
                                                  :pulse_channel_id pc-id}]
            (with-redefs [messages/result-attachment result-attachment]
              (metabase.pulse/send-pulse! pulse)
              (is (= 1
                     (-> @mt/inbox
                         (get (:email (mt/fetch-user :rasta)))
                         last
                         :body
                         last
                         :content
                         str/split-lines
                         (->> (mapv #(str/split % #",")))
                         first
                         count))))))))))
