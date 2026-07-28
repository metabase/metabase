(ns metabase.mcp.v2.tools.subscription-test
  "Contract tests for the `subscription_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.subscription :as tools.subscription]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.subscription/keep-me)

(defn- call-tool!
  [user scopes args]
  (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
    (registry/call-tool scopes nil "subscription_write" args)))

(defn- tool-result
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defn- wire
  "Round-trip through JSON, as the JSON-RPC transport does, so tests can't pass shapes a real
   client could never send."
  [x]
  (-> x json/encode json/decode+kw))

(defn- pulse-channels
  [pulse-id]
  (t2/select :model/PulseChannel :pulse_id pulse-id))

(defn- with-slack
  "Run `thunk` with a configured Slack whose cache holds `#data-team`."
  [thunk]
  (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly true)
                              channel.settings/slack-cached-channels-and-usernames
                              (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
    (thunk)))

;;; ------------------------------------------------- create -------------------------------------------------------

(deftest create-subscription-test
  (testing "GHY-4156: create schedules a dashboard for delivery and returns the subscription"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {:name "Revenue"}
                     :model/Dashboard {dash-id :id} {:name "Sales KPIs"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result (tool-result (call-tool! :crowberto nil
                                              (wire {:method       "create"
                                                     :dashboard_id dash-id
                                                     :schedule     {:schedule_type "daily" :schedule_hour 9}})))]
          (is (pos-int? (:id result)))
          (is (= dash-id (:dashboard_id result)))
          (testing "the subscription is named for the dashboard it delivers"
            (is (= "Sales KPIs" (:name result))))
          (testing "concise subscription projection keys only"
            (is (= #{:id :name :dashboard_id :channels :cards :skip_if_empty :archived :creator_id}
                   (into #{} (keys result)))))
          (testing "one email channel on the requested schedule"
            (is (= [{:channel_type "email" :schedule_type "daily" :schedule_hour 9}]
                   (mapv #(select-keys % [:channel_type :schedule_type :schedule_hour])
                         (:channels result)))))
          (testing "the caller is the default recipient — a subscription with nobody on it is useless"
            (is (= [(mt/user->id :crowberto)]
                   (mapv :id (-> result :channels first :recipients))))))))))

(deftest create-assembles-cards-from-dashcards-test
  (testing "GHY-4156: the server assembles the pulse's card list from the dashboard's dashcards,
            so the agent never has to enumerate them — virtual cards (text, headings) are skipped"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-1 :id} {:name "Revenue"}
                     :model/Card {card-2 :id} {:name "Costs"}
                     :model/Dashboard {dash-id :id} {:name "Sales KPIs"}
                     :model/DashboardCard {dc-1 :id} {:dashboard_id dash-id :card_id card-1 :row 0 :col 0}
                     :model/DashboardCard {dc-2 :id} {:dashboard_id dash-id :card_id card-2 :row 1 :col 0}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id nil :row 2 :col 0
                                             :visualization_settings {:virtual_card {:display "text"}
                                                                      :text "hello"}}]
        (let [result (tool-result (call-tool! :crowberto nil
                                              (wire {:method       "create"
                                                     :dashboard_id dash-id
                                                     :schedule     {:schedule_type "hourly"}})))]
          (is (= [card-1 card-2] (mapv :id (:cards result))))
          (testing "each pulse card is tied to the dashcard it came from, so the send renders the
                    dashboard's layout rather than bare cards"
            (is (= #{dc-1 dc-2}
                   (t2/select-fn-set :dashboard_card_id :model/PulseCard :pulse_id (:id result))))))))))

(deftest create-on-an-empty-dashboard-is-a-teaching-error-test
  (testing "GHY-4156: a dashboard with no cards can't be subscribed to — the pulse API requires at
            least one card, and the bare 400 doesn't say why"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Empty"}]
      (is (re-find #"no cards"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method       "create"
                                                  :dashboard_id dash-id
                                                  :schedule     {:schedule_type "hourly"}}))))))))

(deftest create-requires-dashboard-id-test
  (testing "GHY-4156: create without a dashboard_id is a teaching error, not a schema dump"
    (is (re-find #"`dashboard_id` is required"
                 (tool-error (call-tool! :crowberto nil
                                         (wire {:method "create"
                                                :schedule {:schedule_type "hourly"}})))))))

(deftest create-requires-schedule-test
  (testing "GHY-4156: create without a schedule is a teaching error"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (is (re-find #"`schedule` is required"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "create" :dashboard_id dash-id}))))))))

(deftest update-requires-id-test
  (testing "GHY-4156: update without an id is a teaching error"
    (is (re-find #"`id` is required"
                 (tool-error (call-tool! :crowberto nil (wire {:method "update"})))))))

(deftest create-with-explicit-recipients-test
  (testing "GHY-4156: recipients accept both user ids and raw email addresses, the two shapes the
            pulse channel stores differently (a recipient row vs. details.emails)"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard {dash-id :id} {:name "Sales KPIs"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result (tool-result (call-tool! :crowberto nil
                                              (wire {:method       "create"
                                                     :dashboard_id dash-id
                                                     :schedule     {:schedule_type "daily" :schedule_hour 8}
                                                     :recipients   [(mt/user->id :rasta) "ops@example.com"]})))
              channel (first (pulse-channels (:id result)))]
          (is (= [(mt/user->id :rasta)]
                 (t2/select-fn-vec :user_id :model/PulseChannelRecipient :pulse_channel_id (:id channel))))
          (is (= ["ops@example.com"] (get-in channel [:details :emails])))
          (testing "the stored `details.emails` doesn't reach the caller: it's the internal home for
                    recipients who aren't Metabase users, and `recipients` already lists them, so
                    echoing it would name the same person twice in two shapes"
            (is (= [{:email "ops@example.com"} {:id (mt/user->id :rasta) :email "rasta@metabase.com"}]
                   (-> result :channels first :recipients)))
            (is (nil? (-> result :channels first :details)))))))))

(deftest create-slack-subscription-test
  (testing "GHY-4156: channel \"slack\" resolves the channel name against Slack's cache and stores
            the display name, which is what the sender reads"
    (with-slack
      (fn []
        (mt/with-model-cleanup [:model/Pulse]
          (mt/with-temp [:model/Card {card-id :id} {}
                         :model/Dashboard {dash-id :id} {:name "Sales KPIs"}
                         :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
            (let [result (tool-result (call-tool! :crowberto nil
                                                  (wire {:method        "create"
                                                         :dashboard_id  dash-id
                                                         :schedule      {:schedule_type "daily" :schedule_hour 8}
                                                         :channel       "slack"
                                                         :slack_channel "data-team"})))
                  channel (first (pulse-channels (:id result)))]
              (is (= :slack (:channel_type channel)))
              (is (= "#data-team" (get-in channel [:details :channel]))))))))))

(deftest slack-channel-is-required-for-slack-test
  (testing "GHY-4156: channel \"slack\" without slack_channel is a teaching error, not a channel
            that silently delivers nowhere"
    (with-slack
      (fn []
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
          (is (re-find #"slack_channel"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method       "create"
                                                      :dashboard_id dash-id
                                                      :schedule     {:schedule_type "hourly"}
                                                      :channel      "slack"}))))))))))

(deftest unknown-slack-channel-is-a-teaching-error-test
  (testing "GHY-4156: a Slack channel name Metabase can't see is rejected up front — the send
            would otherwise fail silently, long after the tool reported success"
    (with-slack
      (fn []
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
          (is (re-find #"nowhere"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method        "create"
                                                      :dashboard_id  dash-id
                                                      :schedule      {:schedule_type "hourly"}
                                                      :channel       "slack"
                                                      :slack_channel "does-not-exist"}))))))))))

(deftest slack-not-configured-is-a-teaching-error-test
  (testing "GHY-4156: asking for Slack delivery on an instance with no Slack integration names the fix"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly false)]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard {dash-id :id} {}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (re-find #"Slack is not connected"
                     (tool-error (call-tool! :crowberto nil
                                             (wire {:method        "create"
                                                    :dashboard_id  dash-id
                                                    :schedule      {:schedule_type "hourly"}
                                                    :channel       "slack"
                                                    :slack_channel "data-team"})))))))))

(deftest recipients-are-rejected-for-slack-test
  (testing "GHY-4156: a Slack channel has no recipient list — passing one would be silently dropped"
    (with-slack
      (fn []
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
          (is (re-find #"recipients"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method        "create"
                                                      :dashboard_id  dash-id
                                                      :schedule      {:schedule_type "hourly"}
                                                      :channel       "slack"
                                                      :slack_channel "data-team"
                                                      :recipients    ["ops@example.com"]}))))))))))

(deftest empty-recipients-is-a-teaching-error-test
  (testing "GHY-4156: an empty recipient list is the email analogue of an unresolvable Slack
            channel — the subscription would deliver nowhere, so say so rather than scheduling it"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id
                                                   :user_id (mt/user->id :rasta)}]
      (is (re-find #"nobody"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method       "create"
                                                  :dashboard_id dash-id
                                                  :schedule     {:schedule_type "hourly"}
                                                  :recipients   []})))))
      (testing "and on update, where it would empty a list that currently has people on it"
        (is (re-find #"nobody"
                     (tool-error (call-tool! :crowberto nil
                                             (wire {:method "update" :id pulse-id :recipients []})))))
        (is (= [(mt/user->id :rasta)]
               (t2/select-fn-vec :user_id :model/PulseChannelRecipient :pulse_channel_id pc-id)))))))

;;; ------------------------------------------------ schedules -----------------------------------------------------

(deftest incomplete-schedules-are-teaching-errors-test
  (testing "GHY-4156: the pulse channel's schedule validation is an assertion — every incomplete
            schedule reaches the caller as a sentence naming the missing field instead"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (are [schedule pattern]
           (re-find pattern
                    (tool-error (call-tool! :crowberto nil
                                            (wire {:method       "create"
                                                   :dashboard_id dash-id
                                                   :schedule     schedule}))))
        {:schedule_type "daily"}                                    #"schedule_hour"
        {:schedule_type "weekly" :schedule_hour 9}                  #"schedule_day"
        {:schedule_type "monthly" :schedule_hour 9}                 #"schedule_frame"
        {:schedule_type "monthly" :schedule_hour 9
         :schedule_frame "mid" :schedule_day "mon"}                 #"schedule_day"))))

(deftest monthly-schedule-test
  (testing "GHY-4156: a monthly schedule stores frame and day — \"the first Monday of the month\""
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard {dash-id :id} {}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result (tool-result (call-tool! :crowberto nil
                                              (wire {:method       "create"
                                                     :dashboard_id dash-id
                                                     :schedule     {:schedule_type  "monthly"
                                                                    :schedule_hour  9
                                                                    :schedule_frame "first"
                                                                    :schedule_day   "mon"}})))]
          (is (= {:schedule_type :monthly :schedule_hour 9 :schedule_frame :first :schedule_day "mon"}
                 (-> (first (pulse-channels (:id result)))
                     (select-keys [:schedule_type :schedule_hour :schedule_frame :schedule_day])))))))))

;;; ------------------------------------------------ parameters ----------------------------------------------------

(deftest create-with-parameters-test
  (testing "GHY-4156: parameters make a filtered subscription — only {id, value} is stored, and the
            dashboard's own definition of that parameter is merged in at send time"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard {dash-id :id} {:parameters [{:id "cat" :name "Category"
                                                                   :type "string/=" :slug "category"}]}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result (tool-result (call-tool! :crowberto nil
                                              (wire {:method       "create"
                                                     :dashboard_id dash-id
                                                     :schedule     {:schedule_type "hourly"}
                                                     :parameters   [{:id "cat" :value "Gadget"}]})))]
          (is (= [{:id "cat" :value "Gadget"}]
                 (t2/select-one-fn :parameters :model/Pulse :id (:id result)))))))))

(deftest unknown-parameter-id-is-a-teaching-error-test
  (testing "GHY-4156: a parameter id the dashboard doesn't have would be stored and then silently
            ignored at send time, so it's rejected up front with the ids that do exist"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {:parameters [{:id "cat" :name "Category"
                                                                 :type "string/=" :slug "category"}]}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (let [err (tool-error (call-tool! :crowberto nil
                                        (wire {:method       "create"
                                               :dashboard_id dash-id
                                               :schedule     {:schedule_type "hourly"}
                                               :parameters   [{:id "nope" :value "x"}]})))]
        (is (re-find #"nope" err))
        (is (re-find #"cat" err))))))

;;; ------------------------------------------------- update -------------------------------------------------------

(deftest update-schedule-patches-the-existing-channel-test
  (testing "GHY-4156: changing the schedule edits the subscription's channel in place — a
            rebuilt channel would drop its recipients and re-register its send trigger"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id
                                                   :user_id (mt/user->id :rasta)}]
      (tool-result (call-tool! :crowberto nil
                               (wire {:method   "update"
                                      :id       pulse-id
                                      :schedule {:schedule_type "weekly" :schedule_hour 7
                                                 :schedule_day "fri"}})))
      (let [channels (pulse-channels pulse-id)]
        (is (= 1 (count channels)))
        (is (= pc-id (:id (first channels))))
        (is (= {:schedule_type :weekly :schedule_hour 7 :schedule_day "fri"}
               (select-keys (first channels) [:schedule_type :schedule_hour :schedule_day])))
        (testing "recipients the caller didn't mention are left alone"
          (is (= [(mt/user->id :rasta)]
                 (t2/select-fn-vec :user_id :model/PulseChannelRecipient :pulse_channel_id pc-id))))))))

(deftest update-recipients-test
  (testing "GHY-4156: recipients on update replace the channel's list — the tool has no
            add/remove verbs, so the list the caller sends is the list that ends up stored"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id
                                                   :user_id (mt/user->id :rasta)}]
      (tool-result (call-tool! :crowberto nil
                               (wire {:method     "update"
                                      :id         pulse-id
                                      :recipients [(mt/user->id :lucky)]})))
      (is (= [(mt/user->id :lucky)]
             (t2/select-fn-vec :user_id :model/PulseChannelRecipient :pulse_channel_id pc-id))))))

(deftest update-adds-a-second-channel-test
  (testing "GHY-4156: naming a channel type the subscription doesn't have yet adds it, leaving the
            existing one alone — the same subscription can go to email and Slack"
    (with-slack
      (fn []
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Dashboard {dash-id :id} {}
                       :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                    :creator_id (mt/user->id :crowberto)}
                       :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                       :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                              :schedule_type :daily :schedule_hour 15}]
          (tool-result (call-tool! :crowberto nil
                                   (wire {:method        "update"
                                          :id            pulse-id
                                          :channel       "slack"
                                          :slack_channel "data-team"
                                          :schedule      {:schedule_type "hourly"}})))
          (is (= #{:email :slack} (into #{} (map :channel_type) (pulse-channels pulse-id)))))))))

(deftest update-without-a-channel-on-a-multi-channel-subscription-test
  (testing "GHY-4156: with more than one channel the tool can't guess which to edit, so it asks
            rather than picking one or flattening the subscription to a single channel"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :slack
                                          :details {:channel "#x"}
                                          :schedule_type :daily :schedule_hour 15}]
      (is (re-find #"`channel`"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method   "update"
                                                  :id       pulse-id
                                                  :schedule {:schedule_type "hourly"}}))))))))

(deftest update-archived-round-trip-test
  (testing "GHY-4156: archived true pauses the subscription and false resumes it — the only
            removal path, matching how the product pauses subscriptions"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}]
      (is (true? (:archived (tool-result (call-tool! :crowberto nil
                                                     (wire {:method "update" :id pulse-id :archived true}))))))
      (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
      (tool-result (call-tool! :crowberto nil (wire {:method "update" :id pulse-id :archived false})))
      (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id))))))

(deftest archived-subscriptions-stay-paused-test
  (testing "GHY-4156: a Pulse encodes \"archived\" by disabling its channels, and the channel write
            lands after the Pulse write — so a channel edit in the same call, or any edit to an
            already-archived subscription, must not leave a channel enabled. An enabled channel
            re-registers the send trigger and the subscription keeps delivering from the trash."
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannel {sc-id :id} {:pulse_id pulse-id :channel_type :slack
                                                    :details {:channel "#ops"}
                                                    :schedule_type :daily :schedule_hour 15}]
      (testing "archiving and editing a channel in one call disables every channel"
        (tool-result (call-tool! :crowberto nil
                                 (wire {:method   "update"
                                        :id       pulse-id
                                        :archived true
                                        :channel  "email"
                                        :schedule {:schedule_type "weekly" :schedule_hour 7
                                                   :schedule_day "fri"}})))
        (testing "including the channel that only rode along"
          (is (= [false false]
                 (mapv :enabled (sort-by :id [(t2/select-one :model/PulseChannel :id pc-id)
                                              (t2/select-one :model/PulseChannel :id sc-id)]))))))
      (testing "a later schedule-only edit doesn't quietly resume it"
        (tool-result (call-tool! :crowberto nil
                                 (wire {:method   "update"
                                        :id       pulse-id
                                        :channel  "email"
                                        :schedule {:schedule_type "hourly"}})))
        (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
        (is (false? (t2/select-one-fn :enabled :model/PulseChannel :id pc-id))))
      (testing "unarchiving re-enables the channels"
        (tool-result (call-tool! :crowberto nil (wire {:method "update" :id pulse-id :archived false})))
        (is (true? (t2/select-one-fn :enabled :model/PulseChannel :id pc-id)))))))

(deftest unarchiving-while-editing-a-channel-re-enables-it-test
  (testing "GHY-4156: `archived` false alongside a channel edit resumes delivery — the channel
            write must not restore the disabled state the Pulse write just cleared"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)
                                                :archived true}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :enabled false
                                                    :schedule_type :daily :schedule_hour 15}]
      (tool-result (call-tool! :crowberto nil
                               (wire {:method   "update"
                                      :id       pulse-id
                                      :archived false
                                      :schedule {:schedule_type "weekly" :schedule_hour 7
                                                 :schedule_day "fri"}})))
      (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
      (is (true? (t2/select-one-fn :enabled :model/PulseChannel :id pc-id))))))

(deftest update-skip-if-empty-test
  (testing "GHY-4156: skip_if_empty suppresses the send when the dashboard has no results"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)
                                                :skip_if_empty false}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}]
      (is (true? (:skip_if_empty
                  (tool-result (call-tool! :crowberto nil
                                           (wire {:method "update" :id pulse-id :skip_if_empty true})))))))))

(deftest update-leaves-cards-alone-test
  (testing "GHY-4156: an update that doesn't mention cards leaves the pulse's card list untouched —
            the card list is assembled once, at create"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}]
      (tool-result (call-tool! :crowberto nil (wire {:method "update" :id pulse-id :skip_if_empty true})))
      (is (= [card-id] (t2/select-fn-vec :card_id :model/PulseCard :pulse_id pulse-id))))))

(deftest entity-id-is-accepted-test
  (testing "GHY-4156: `id` accepts a 21-character entity_id as well as a numeric id"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse pulse {:name "Weekly" :dashboard_id dash-id
                                       :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id (:id pulse) :card_id card-id}
                   :model/PulseChannel _ {:pulse_id (:id pulse) :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}]
      (is (= (:id pulse)
             (:id (tool-result (call-tool! :crowberto nil
                                           (wire {:method "update" :id (:entity_id pulse)
                                                  :skip_if_empty true})))))))))

(deftest dashboard-id-accepts-entity-id-test
  (testing "GHY-4156: `dashboard_id` accepts an entity_id, like every other id argument in v2"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard dash {:name "Sales KPIs"}
                     :model/DashboardCard _ {:dashboard_id (:id dash) :card_id card-id}]
        (is (= (:id dash)
               (:dashboard_id (tool-result (call-tool! :crowberto nil
                                                       (wire {:method       "create"
                                                              :dashboard_id (:entity_id dash)
                                                              :schedule     {:schedule_type "hourly"}}))))))))))

;;; ------------------------------------------------ permissions ---------------------------------------------------

(deftest alerts-are-not-subscriptions-test
  (testing "GHY-4156: an alert lives in the same id space as subscriptions but is a different
            concept with its own tool — targeting one collapses to not-found"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Alert" :alert_condition "rows"
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}]
      (is (re-find #"not found"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "update" :id pulse-id :archived true}))))))))

(deftest update-requires-write-permission-test
  (testing "GHY-4156: a non-admin can only edit subscriptions they created — someone else's is
            readable (they're a recipient) but not writable, and nothing changes"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id
                                                   :user_id (mt/user->id :rasta)}]
      (is (some? (tool-error (call-tool! :rasta nil
                                         (wire {:method "update" :id pulse-id :archived true})))))
      (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id))))))

(deftest create-requires-dashboard-read-permission-test
  (testing "GHY-4156: subscribing to a dashboard you can't read is refused — a subscription would
            otherwise be a channel for exfiltrating its contents"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (some? (tool-error (call-tool! :rasta nil
                                           (wire {:method       "create"
                                                  :dashboard_id dash-id
                                                  :schedule     {:schedule_type "hourly"}})))))
        (is (zero? (t2/count :model/Pulse :dashboard_id dash-id)))))))

(deftest scope-gates-the-tool-test
  (testing "GHY-4156: a token without the subscribe scope can't call the tool at all"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (is (re-find #"Insufficient scope"
                   (tool-error (call-tool! :crowberto #{"agent:search"}
                                           (wire {:method       "create"
                                                  :dashboard_id dash-id
                                                  :schedule     {:schedule_type "hourly"}}))))))))

(deftest one-write-scope-covers-both-methods-test
  (testing "GHY-4156: one write scope per entity type — `agent:subscription:write` gates both
            methods, and the v1 `agent:dashboard:subscribe` no longer reaches the v2 tool (it stays
            declared because MCP v1's own subscription tools still use it)"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-temp [:model/Card {card-id :id} {}
                     :model/Dashboard {dash-id :id} {:name "Sales KPIs"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}
                     :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                  :creator_id (mt/user->id :crowberto)}
                     :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                     :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                            :schedule_type :daily :schedule_hour 15}]
        (let [write-scope #{"agent:subscription:write"}]
          (testing "create"
            (is (pos-int? (:id (tool-result (call-tool! :crowberto write-scope
                                                        (wire {:method       "create"
                                                               :dashboard_id dash-id
                                                               :schedule     {:schedule_type "hourly"}})))))))
          (testing "update"
            (is (true? (:archived (tool-result (call-tool! :crowberto write-scope
                                                           (wire {:method "update" :id pulse-id
                                                                  :archived true})))))))
          (testing "the v1 subscribe scope alone is refused, and nothing changes"
            (is (re-find #"Insufficient scope"
                         (tool-error (call-tool! :crowberto #{"agent:dashboard:subscribe"}
                                                 (wire {:method "update" :id pulse-id
                                                        :archived false})))))
            (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))))))))

(deftest null-args-are-dropped-at-the-boundary-test
  (testing "GHY-4156: strict clients fill every declared property they aren't setting with null;
            those are stripped before the handler, so an update that means to change one field
            doesn't clobber the rest — in particular the channel is left entirely alone"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)
                                                :skip_if_empty false}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id} {:pulse_id pulse-id :channel_type :email
                                                    :schedule_type :daily :schedule_hour 15}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id
                                                   :user_id (mt/user->id :rasta)}]
      (tool-result (call-tool! :crowberto nil
                               (wire {:method "update" :id pulse-id :skip_if_empty true
                                      :schedule nil :channel nil :slack_channel nil
                                      :recipients nil :parameters nil :archived nil})))
      (is (true? (t2/select-one-fn :skip_if_empty :model/Pulse :id pulse-id)))
      (is (= {:schedule_type :daily :schedule_hour 15}
             (select-keys (first (pulse-channels pulse-id)) [:schedule_type :schedule_hour])))
      (is (= [(mt/user->id :rasta)]
             (t2/select-fn-vec :user_id :model/PulseChannelRecipient :pulse_channel_id pc-id)))
      (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id))))))

(deftest update-with-nothing-to-change-is-a-teaching-error-test
  (testing "GHY-4156: an update naming no field at all is the agent losing track of what it meant
            to change — say so rather than reporting success for a write that never happened"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/Pulse {pulse-id :id} {:name "Weekly" :dashboard_id dash-id
                                                :creator_id (mt/user->id :crowberto)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email
                                          :schedule_type :daily :schedule_hour 15}]
      (is (re-find #"Nothing to update"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "update" :id pulse-id}))))))))
