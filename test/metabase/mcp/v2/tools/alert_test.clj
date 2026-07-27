(ns metabase.mcp.v2.tools.alert-test
  "Contract tests for the `alert_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.alert :as tools.alert]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.alert/keep-me)

(use-fixtures :once (fixtures/initialize :notifications))

(defn- call-tool!
  [user scopes args]
  (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
    (registry/call-tool scopes nil "alert_write" args)))

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
  "Round-trip through JSON, so tests exercise the argument shapes an MCP client actually sends."
  [x]
  (-> x json/encode json/decode+kw))

(def ^:private fake-slack-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(defmacro ^:private with-slack
  [& body]
  `(mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly true)
                               channel.settings/slack-cached-channels-and-usernames
                               (constantly fake-slack-channels)]
     ~@body))

(defn- daily-schedule [hour] {:schedule_type "daily" :schedule_hour hour})

(defn- create-alert!
  "Create an alert on `card-id` through the tool as :crowberto, returning the tool's response body."
  ([card-id] (create-alert! card-id {}))
  ([card-id extra]
   (tool-result (call-tool! :crowberto nil
                            (wire (merge {:method "create" :card_id card-id
                                          :schedule (daily-schedule 9)}
                                         extra))))))

;;; ------------------------------------------------- create -------------------------------------------------------

(deftest create-alert-test
  (testing "GHY-4155: create makes a card notification with a cron subscription and an email handler
            addressed to the caller, and echoes the concise alert projection"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [result (create-alert! card-id)]
          (is (pos-int? (:id result)))
          (is (true? (:active result)))
          (is (= #{:id :active :payload :subscriptions :handlers :creator_id}
                 (set (keys result))))
          (testing "the payload carries the card and the default condition"
            (is (= {:card_id card-id :send_condition "has_result" :send_once false}
                   (:payload result))))
          (testing "the schedule compiles to cron — agents never author cron themselves"
            (is (= ["0 0 9 * * ? *"] (mapv :cron_schedule (:subscriptions result))))
            (testing "and is marked as builder-authored, so the alert edits in the schedule picker"
              (is (= ["cron/builder"] (mapv :ui_display_type (:subscriptions result))))))
          (testing "the caller is the default recipient on the default email channel"
            (is (= ["channel/email"] (mapv :channel_type (:handlers result))))
            (is (= [{:type "notification-recipient/user" :user_id (mt/user->id :crowberto)
                     :email "crowberto@metabase.com"}]
                   (-> result :handlers first :recipients)))))))))

(deftest create-required-fields-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (testing "GHY-4155: create without a card_id is a teaching error, not a schema dump"
      (is (re-find #"`card_id` is required"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "create" :schedule (daily-schedule 9)}))))))
    (testing "GHY-4155: create without a schedule is a teaching error"
      (is (re-find #"`schedule` is required"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "create" :card_id card-id}))))))
    (testing "GHY-4155: update without an id is a teaching error"
      (is (re-find #"`id` is required"
                   (tool-error (call-tool! :crowberto nil (wire {:method "update"}))))))))

(deftest schedule-compilation-test
  (testing "GHY-4155: every ScheduleMap shape compiles to the cron string the notification API stores"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (are [schedule cron] (= [cron]
                                (mapv :cron_schedule (:subscriptions (create-alert! card-id {:schedule schedule}))))
          {:schedule_type "hourly"}                                             "0 0 * * * ? *"
          {:schedule_type "daily" :schedule_hour 0}                             "0 0 0 * * ? *"
          {:schedule_type "weekly" :schedule_hour 8 :schedule_day "mon"}        "0 0 8 ? * 2 *"
          {:schedule_type "monthly" :schedule_hour 8 :schedule_frame "first"}   "0 0 8 1 * ? *"
          {:schedule_type "monthly" :schedule_hour 8 :schedule_frame "last"
           :schedule_day "fri"}                                                 "0 0 8 ? * 6L *")))))

(deftest condition-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (testing "GHY-4155: send_once rides the condition object alongside its type"
        (is (= {:card_id card-id :send_condition "has_result" :send_once true}
               (:payload (create-alert! card-id {:condition {:type "has_result" :send_once true}})))))
      (testing "GHY-4155: an omitted condition type still defaults to has_result"
        (is (= "has_result"
               (-> (create-alert! card-id {:condition {:send_once true}}) :payload :send_condition)))))))

(deftest goal-condition-requires-a-goal-line-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "GHY-4155: a goal condition on a question with no goal line is caught at create — the
              notification backend only discovers this at send time, where nobody is watching"
      (mt/with-temp [:model/Card {card-id :id} {:display :table}]
        (let [err (tool-error (call-tool! :crowberto nil
                                          (wire {:method "create" :card_id card-id
                                                 :schedule (daily-schedule 9)
                                                 :condition {:type "goal_above"}})))]
          (is (re-find #"goal" err))
          (is (zero? (t2/count :model/NotificationCard :card_id card-id))))))
    (testing "GHY-4155: a line chart carrying a goal value takes the same condition"
      (mt/with-temp [:model/Card {card-id :id} {:display                :line
                                                :visualization_settings {:graph.goal_value 100}}]
        (is (= "goal_above"
               (-> (create-alert! card-id {:condition {:type "goal_above"}}) :payload :send_condition)))))
    (testing "GHY-4155: a progress chart always has a goal, so it needs no viz setting"
      (mt/with-temp [:model/Card {card-id :id} {:display :progress}]
        (is (= "goal_below"
               (-> (create-alert! card-id {:condition {:type "goal_below"}}) :payload :send_condition)))))))

;;; ------------------------------------------------ recipients ----------------------------------------------------

(deftest email-recipients-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (testing "GHY-4155: recipients accept both user ids and bare email addresses"
        (let [result     (create-alert! card-id {:recipients [(mt/user->id :rasta) "someone@example.com"]})
              recipients (-> result :handlers first :recipients)]
          (is (= #{"notification-recipient/user" "notification-recipient/raw-value"}
                 (set (map :type recipients))))
          (is (= #{"rasta@metabase.com" "someone@example.com"}
                 (set (map :email recipients))))))
      (testing "GHY-4155: a string that isn't an email address is a teaching error, not a raw-value recipient"
        (is (re-find #"email"
                     (tool-error (call-tool! :crowberto nil
                                             (wire {:method "create" :card_id card-id
                                                    :schedule (daily-schedule 9)
                                                    :recipients ["data-team"]}))))))
      (testing "GHY-4155: an unknown user id names the id rather than failing at the FK"
        (is (re-find #"13371337"
                     (tool-error (call-tool! :crowberto nil
                                             (wire {:method "create" :card_id card-id
                                                    :schedule (daily-schedule 9)
                                                    :recipients [13371337]})))))))))

(deftest slack-channel-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (with-slack
        (testing "GHY-4155: a slack alert stores the channel as a raw-value recipient, resolved to its
                  display name and slack id — the agent passes a name, never an id"
          (let [result (create-alert! card-id {:channel "slack" :slack_channel "data-team"})]
            (is (= ["channel/slack"] (mapv :channel_type (:handlers result))))
            (is (= [{:type "notification-recipient/raw-value" :email "#data-team"}]
                   (-> result :handlers first :recipients)))
            (is (= {:value "#data-team" :channel_id "C123"}
                   (t2/select-one-fn :details :model/NotificationRecipient
                                     :notification_handler_id
                                     (t2/select-one-fn :id :model/NotificationHandler
                                                       :notification_id (:id result)))))))
        (testing "GHY-4155: an unknown channel name is a teaching error"
          (is (re-find #"no-such-channel"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "create" :card_id card-id
                                                      :schedule (daily-schedule 9)
                                                      :channel "slack" :slack_channel "no-such-channel"}))))))
        (testing "GHY-4155: channel slack without slack_channel names the missing argument"
          (is (re-find #"slack_channel"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "create" :card_id card-id
                                                      :schedule (daily-schedule 9)
                                                      :channel "slack"}))))))
        (testing "GHY-4155: recipients are meaningless on a slack alert — the channel is the recipient"
          (is (re-find #"recipients"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "create" :card_id card-id
                                                      :schedule (daily-schedule 9)
                                                      :channel "slack" :slack_channel "data-team"
                                                      :recipients ["someone@example.com"]})))))))
      (testing "GHY-4155: slack that isn't set up at all says so, rather than 'channel not found'"
        (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly false)]
          (is (re-find #"not configured"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "create" :card_id card-id
                                                      :schedule (daily-schedule 9)
                                                      :channel "slack" :slack_channel "data-team"}))))))))))

;;; ------------------------------------------------- update -------------------------------------------------------

(deftest update-patches-only-what-it-is-given-test
  (testing "GHY-4155: update is a patch — the fields it doesn't mention survive, including the
            handler and subscription rows the notification update spec would otherwise delete"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [created (create-alert! card-id {:recipients [(mt/user->id :rasta)]})
              updated (tool-result (call-tool! :crowberto nil
                                               (wire {:method "update" :id (:id created)
                                                      :condition {:send_once true}})))]
          (is (= {:card_id card-id :send_condition "has_result" :send_once true} (:payload updated)))
          (is (= ["0 0 9 * * ? *"] (mapv :cron_schedule (:subscriptions updated))))
          (is (= [(mt/user->id :rasta)]
                 (map :user_id (-> updated :handlers first :recipients)))))))))

(deftest update-schedule-and-recipients-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [created (create-alert! card-id)]
        (testing "GHY-4155: a new schedule replaces the alert's single cron subscription"
          (let [updated (tool-result (call-tool! :crowberto nil
                                                 (wire {:method "update" :id (:id created)
                                                        :schedule {:schedule_type "weekly"
                                                                   :schedule_hour 8
                                                                   :schedule_day "mon"}})))]
            (is (= ["0 0 8 ? * 2 *"] (mapv :cron_schedule (:subscriptions updated))))))
        (testing "GHY-4155: new recipients replace the old ones on the same channel"
          (let [updated (tool-result (call-tool! :crowberto nil
                                                 (wire {:method "update" :id (:id created)
                                                        :recipients ["someone@example.com"]})))]
            (is (= ["channel/email"] (mapv :channel_type (:handlers updated))))
            (is (= ["someone@example.com"] (map :email (-> updated :handlers first :recipients))))))))))

(deftest update-recipients-patches-the-handler-test
  (testing "GHY-4155: editing recipients on the same channel patches the stored handler rather than
            deleting and recreating it, so nothing downstream sees the handler disappear"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [created    (create-alert! card-id)
              handler-id (-> created :handlers first :id)
              updated    (tool-result (call-tool! :crowberto nil
                                                  (wire {:method "update" :id (:id created)
                                                         :recipients ["someone@example.com"]})))]
          (is (= handler-id (-> updated :handlers first :id))))))))

(deftest update-refuses-to-collapse-multi-channel-delivery-test
  (testing "GHY-4155: an alert built in the product can deliver over several channels; this tool
            writes one, so changing delivery would silently drop the rest — refuse instead"
    (notification.tu/with-card-notification
      [notification {:card         {}
                     :notification {:creator_id (mt/user->id :crowberto)}
                     :handlers     [{:channel_type :channel/email
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :crowberto)}]}
                                    {:channel_type :channel/slack
                                     :recipients   [{:type    :notification-recipient/raw-value
                                                     :details {:value "#data-team"}}]}]}]
      (is (re-find #"more than one channel"
                   (tool-error (call-tool! :crowberto nil
                                           (wire {:method "update" :id (:id notification)
                                                  :recipients ["someone@example.com"]})))))
      (testing "but an edit that leaves delivery alone still goes through"
        (is (false? (:active (tool-result (call-tool! :crowberto nil
                                                      (wire {:method "update" :id (:id notification)
                                                             :active false}))))))))))

(deftest update-preserves-a-stale-goal-condition-test
  (testing "GHY-4155: an alert whose chart lost its goal line since creation must still be pausable —
            the goal check belongs to setting the condition, not to every update"
    (mt/with-temp [:model/Card {card-id :id} {:display :table}]
      (notification.tu/with-card-notification
        [notification {:card              {}
                       :notification      {:creator_id (mt/user->id :crowberto)}
                       :notification_card {:send_condition :goal_above}
                       :handlers          []}]
        (t2/update! :model/NotificationCard (:payload_id notification) {:card_id card-id})
        (is (false? (:active (tool-result (call-tool! :crowberto nil
                                                      (wire {:method "update" :id (:id notification)
                                                             :active false}))))))
        (testing "setting the same condition again does re-check, and now fails"
          (is (re-find #"goal"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "update" :id (:id notification)
                                                      :condition {:type "goal_above"}}))))))))))

(deftest update-switches-channel-test
  (testing "GHY-4155: switching an email alert to slack replaces the handler outright"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (with-slack
          (let [created (create-alert! card-id)
                updated (tool-result (call-tool! :crowberto nil
                                                 (wire {:method "update" :id (:id created)
                                                        :channel "slack" :slack_channel "data-team"})))]
            (is (= ["channel/slack"] (mapv :channel_type (:handlers updated))))
            (is (= ["#data-team"] (map :email (-> updated :handlers first :recipients))))
            (is (= 1 (t2/count :model/NotificationHandler :notification_id (:id created))))))))))

(deftest active-round-trip-test
  (testing "GHY-4155: alerts pause and resume through `active` — there is no archived flag for them"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [created (create-alert! card-id)]
          (is (false? (:active (tool-result (call-tool! :crowberto nil
                                                        (wire {:method "update" :id (:id created)
                                                               :active false}))))))
          (is (false? (t2/select-one-fn :active :model/Notification :id (:id created))))
          (is (true? (:active (tool-result (call-tool! :crowberto nil
                                                       (wire {:method "update" :id (:id created)
                                                              :active true})))))))))))

(deftest card-id-is-create-only-test
  (testing "GHY-4155: an alert's question can't be swapped out — say so instead of silently ignoring it"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id}  {}
                     :model/Card {other-id :id} {}]
        (let [created (create-alert! card-id)]
          (is (re-find #"card_id"
                       (tool-error (call-tool! :crowberto nil
                                               (wire {:method "update" :id (:id created)
                                                      :card_id other-id})))))
          (is (= card-id (t2/select-one-fn :card_id :model/NotificationCard
                                           :id (t2/select-one-fn :payload_id :model/Notification
                                                                 :id (:id created))))))))))

(deftest null-arguments-are-dropped-at-the-boundary-test
  (testing "GHY-4155: strict clients fill every declared property with null; those must read as
            'not set' rather than clobbering the stored alert"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [created (create-alert! card-id {:recipients [(mt/user->id :rasta)]})
              updated (tool-result (call-tool! :crowberto nil
                                               (wire {:method "update" :id (:id created)
                                                      :card_id nil :condition nil :schedule nil
                                                      :channel nil :slack_channel nil
                                                      :recipients nil :active nil})))]
          (is (true? (:active updated)))
          (is (= ["0 0 9 * * ? *"] (mapv :cron_schedule (:subscriptions updated))))
          (is (= [(mt/user->id :rasta)]
                 (map :user_id (-> updated :handlers first :recipients)))))))))

;;; ------------------------------------------------ id handling ---------------------------------------------------

(deftest id-must-be-numeric-test
  (testing "GHY-4155: notifications have no entity_id column, so an entity_id-shaped id is a
            teaching error rather than a confusing not-found"
    (is (re-find #"numeric id"
                 (tool-error (call-tool! :crowberto nil
                                         (wire {:method "update" :id "sqkfMD8bLLBqZ0lVdOU6D"})))))))

(deftest unknown-alert-is-not-found-test
  (testing "GHY-4155: an unreadable alert and a nonexistent one are indistinguishable — no existence oracle"
    (notification.tu/with-card-notification
      [notification {:card              {}
                     :notification      {:creator_id (mt/user->id :crowberto)}
                     :notification_card {}
                     :handlers          []}]
      (let [norm #(str/replace % #"\d+" "N")]
        (is (= (norm (tool-error (call-tool! :rasta nil (wire {:method "update" :id (:id notification)
                                                               :active false}))))
               (norm (tool-error (call-tool! :rasta nil (wire {:method "update" :id 13371337
                                                               :active false}))))))))))

;;; ----------------------------------------------- permissions ----------------------------------------------------

(deftest card-read-permission-is-inherited-test
  (testing "GHY-4155: an alert can only be created on a question the caller can read — the check is
            the notification model's, inherited rather than reimplemented"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card       {card-id :id} {:collection_id coll-id}]
          (is (some? (tool-error (call-tool! :rasta nil
                                             (wire {:method "create" :card_id card-id
                                                    :schedule (daily-schedule 9)})))))
          (is (zero? (t2/count :model/NotificationCard :card_id card-id))))))))

(deftest update-requires-ownership-test
  (testing "GHY-4155: a non-creator, non-admin cannot edit someone else's alert"
    (notification.tu/with-card-notification
      [notification {:card         {}
                     :notification {:creator_id (mt/user->id :crowberto)}
                     :handlers     [{:channel_type :channel/email
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :rasta)}]}]}]
      ;; rasta is a recipient, so the alert reads — but editing it is still refused.
      (is (some? (tool-error (call-tool! :rasta nil
                                         (wire {:method "update" :id (:id notification) :active false})))))
      (is (true? (t2/select-one-fn :active :model/Notification :id (:id notification)))))))

;;; -------------------------------------------------- scopes ------------------------------------------------------

(deftest ^:parallel scope-gating-test
  (let [args (wire {:method "update" :id 13371337 :active false})]
    (testing "GHY-4155: a bearer token without the alert scope is refused before dispatch"
      (is (= "Insufficient scope to call tool: alert_write"
             (tool-error (call-tool! :crowberto #{"agent:search"} args)))))
    (testing "GHY-4155: the create scope alone lists and calls the tool, but cannot update"
      (is (re-find #"can create but not update"
                   (tool-error (call-tool! :crowberto #{metabot.scope/agent-alert-create} args)))))
    (testing "GHY-4155: holding both scopes reaches the id lookup"
      (is (re-find #"not found"
                   (tool-error (call-tool! :crowberto #{metabot.scope/agent-alert-create
                                                        metabot.scope/agent-alert-update}
                                           args)))))
    (testing "GHY-4155: the wildcard the metabot permission bucket grants passes too"
      (is (re-find #"not found" (tool-error (call-tool! :crowberto #{"agent:alert:*"} args)))))))

(deftest ^:parallel scopes-grantable-test
  (testing "GHY-4155: both scopes a tool checks must be grantable — advertised through registered-scopes"
    (is (set/subset? #{"agent:alert:create" "agent:alert:update"} (registry/registered-scopes))))
  (testing "GHY-4155: the metabot other-tools bucket covers them via its agent:alert:* wildcard"
    (let [scopes (metabot.scope/user-metabot-perms->scopes {:permission/metabot-other-tools :yes})]
      (is (mcp.scope/matches? scopes "agent:alert:create"))
      (is (mcp.scope/matches? scopes "agent:alert:update")))))

(deftest ^:parallel tools-list-visibility-test
  (testing "GHY-4155: the tool is visible exactly to tokens carrying its create scope"
    (is (some #(= "alert_write" (:name %)) (registry/list-tools #{"agent:alert:create"})))
    (is (not (some #(= "alert_write" (:name %)) (registry/list-tools #{"agent:search"}))))))
