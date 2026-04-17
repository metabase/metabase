(ns metabase-enterprise.security-center.notification-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase-enterprise.security-center.task.sync-advisories :as task.sync]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.send :as notification.send]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- advisory-fixture
  "Common fixture map for a SecurityAdvisory row."
  [overrides]
  (merge {:severity          "critical"
          :title             "Test Advisory"
          :description       "A test advisory"
          :remediation       "Upgrade to latest"
          :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
          :matching_query    {:default {:select [1] :from [:core_user] :limit 1}}
          :match_status      "not_affected"
          :published_at      #t "2026-03-24T00:00:00Z"
          :updated_at        #t "2026-03-24T00:00:00Z"}
         overrides))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro ^:private with-send-redef
  "Redef send-notification!, email-configured?, and publish-event! to intercept notification sends."
  [send-fn & body]
  `(with-redefs [events/publish-event!               (constantly nil)
                 channel.settings/email-configured?   (constantly true)
                 notification.send/send-notification!  ~send-fn]
     ~@body))

;; Clean the security_advisory table before each repeat-notification test
;; so dev-seeded advisories don't interfere.
(defn- with-clean-advisories [f]
  (let [existing-ids (t2/select-pks-set :model/SecurityAdvisory)]
    (try
      (when (seq existing-ids)
        (t2/update! :model/SecurityAdvisory {:id [:in existing-ids]}
                    {:acknowledged_at (mi/now)
                     :acknowledged_by (mt/user->id :crowberto)}))
      (f)
      (finally
        (when (seq existing-ids)
          (t2/update! :model/SecurityAdvisory {:id [:in existing-ids]}
                      {:acknowledged_at nil
                       :acknowledged_by nil}))))))

;;; --------------------------------------------- Repeat notification task --------------------------------------------

(deftest repeat-notification-cadence-test
  (with-clean-advisories
    (fn []
      (testing "critical advisories: daily cadence"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-001"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/hours 25))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (= ["SC-REPEAT-001"] @notified))))))

      (testing "critical advisories: too soon — no repeat"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-002"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/hours 12))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "high severity: 3-day cadence"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-003"
                                            :severity         "high"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 8))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (= ["SC-REPEAT-003"] @notified))))))

      (testing "high severity: too soon — no repeat"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-004"
                                            :severity         "high"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 1))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "never-notified advisory is always due"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-005"
                                            :severity         "low"
                                            :match_status     "active"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (= ["SC-REPEAT-005"] @notified))))))

      (testing "medium severity: weekly cadence"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-MED-001"
                                            :severity         "medium"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 8))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (= ["SC-MED-001"] @notified))))))

      (testing "low severity: weekly cadence, too soon"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-LOW-001"
                                            :severity         "low"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 5))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "error-status advisories are included in repeat notifications"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-ERR-001"
                                            :severity         "high"
                                            :match_status     "error"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (= ["SC-ERR-001"] @notified)))))))))

(deftest repeat-notification-exclusions-test
  (with-clean-advisories
    (fn []
      (testing "acknowledged advisories are excluded from repeat notifications"
        (let [notified (atom [])]
          (mt/with-temp [:model/User {user-id :id} {:is_superuser true}
                         :model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-ACK-001"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at nil
                                            :acknowledged_by  user-id
                                            :acknowledged_at  (mi/now)})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "not_affected advisories are excluded from repeat notifications"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-NA-001"
                                            :severity         "critical"
                                            :match_status     "not_affected"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "resolved advisories are excluded from repeat notifications"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-RES-001"
                                            :severity         "critical"
                                            :match_status     "resolved"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.sync/send-repeat-notifications!)
              (is (empty? @notified)))))))))

(deftest repeat-notification-error-isolation-test
  (with-clean-advisories
    (fn []
      (testing "failure notifying one advisory does not block others"
        (let [notified (atom [])
              call-count (atom 0)]
          (mt/with-temp [:model/SecurityAdvisory _a1
                         (advisory-fixture {:advisory_id      "SC-ISO-001"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at nil})
                         :model/SecurityAdvisory _a2
                         (advisory-fixture {:advisory_id      "SC-ISO-002"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a]
                                                          (swap! call-count inc)
                                                          (if (= 1 @call-count)
                                                            (throw (ex-info "transient failure" {}))
                                                            (swap! notified conj (:advisory_id a))))]
              (task.sync/send-repeat-notifications!)
              ;; The second advisory should still be notified despite the first one failing
              (is (= 1 (count @notified))))))))))

;;; ------------------------------------------------ notify-advisory! ------------------------------------------------

(deftest notify-advisory-publishes-event-test
  (testing "notify-advisory! publishes :event/security-advisory-match for audit logging"
    (let [published (atom [])]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-EVENT-001"
                                        :severity     "high"
                                        :match_status "active"})]
        (with-redefs [events/publish-event!               (fn [topic info] (swap! published conj {:topic topic :info info}))
                      channel.settings/email-configured?   (constantly true)
                      notification.send/send-notification! (constantly nil)]
          (notification/notify-advisory! advisory)
          (is (= 1 (count @published)))
          (is (= :event/security-advisory-match (:topic (first @published))))
          (is (= "SC-EVENT-001" (get-in (first @published) [:info :object :advisory_id]))))))))

(deftest notify-advisory-updates-last-notified-at-test
  (testing "notify-advisory! sets last_notified_at on the advisory"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   (advisory-fixture {:advisory_id  "SC-TS-001"
                                      :severity     "critical"
                                      :match_status "active"})]
      (is (nil? (:last_notified_at advisory)))
      (with-send-redef (constantly nil)
        (notification/notify-advisory! advisory))
      (is (some? (:last_notified_at (t2/select-one :model/SecurityAdvisory (:id advisory))))))))

(deftest notify-advisory-does-not-update-on-send-failure-test
  (testing "last_notified_at is NOT set when send-notification! throws"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   (advisory-fixture {:advisory_id  "SC-FAIL-001"
                                      :severity     "critical"
                                      :match_status "active"})]
      (with-send-redef (fn [& _] (throw (ex-info "boom" {})))
        (is (thrown-with-msg? Exception #"boom"
                              (notification/notify-advisory! advisory))))
      (is (nil? (:last_notified_at (t2/select-one :model/SecurityAdvisory (:id advisory))))))))

;;; -------------------------------------------- Recipient resolution -------------------------------------------------

(deftest admin-email-included-when-set-test
  (testing "site admin email is appended as a raw-value recipient"
    (let [sent         (atom nil)
          custom-recip [{:type :notification-recipient/external-email :details {:email "security@example.com"}}]]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-ADMIN-001"
                                        :severity     "critical"
                                        :match_status "active"})]
        (mt/with-temporary-setting-values [admin-email "boss@example.com"]
          (with-redefs [settings/security-center-email-recipients (constantly custom-recip)]
            (with-send-redef (fn [notif & _] (reset! sent notif))
              (notification/notify-advisory! advisory)
              (let [email-handler (first (filter #(= :channel/email (:channel_type %)) (:handlers @sent)))
                    recipients    (:recipients email-handler)]
                (is (= 2 (count recipients)))
                ;; configured recipient
                (is (= :notification-recipient/external-email (:type (first recipients))))
                ;; admin email appended
                (is (= {:type :notification-recipient/raw-value :details {:value "boss@example.com"}}
                       (last recipients))))))))))

  (testing "no admin email appended when admin-email setting is nil"
    (let [sent         (atom nil)
          custom-recip [{:type :notification-recipient/external-email :details {:email "security@example.com"}}]]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-ADMIN-002"
                                        :severity     "high"
                                        :match_status "active"})]
        (mt/with-temporary-setting-values [admin-email nil]
          (with-redefs [settings/security-center-email-recipients (constantly custom-recip)]
            (with-send-redef (fn [notif & _] (reset! sent notif))
              (notification/notify-advisory! advisory)
              (let [email-handler (first (filter #(= :channel/email (:channel_type %)) (:handlers @sent)))
                    recipients    (:recipients email-handler)]
                (is (= 1 (count recipients)))
                (is (= :notification-recipient/external-email (:type (first recipients))))))))))))

(deftest email-recipients-custom-list-test
  (testing "when security-center-email-recipients is set, those specific recipients are used"
    (let [sent         (atom nil)
          custom-recip [{:type :notification-recipient/external-email :details {:email "security@example.com"}}]]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-RECIP-002"
                                        :severity     "high"
                                        :match_status "active"})]
        (mt/with-temporary-setting-values [admin-email nil]
          (with-redefs [settings/security-center-email-recipients (constantly custom-recip)]
            (with-send-redef (fn [notif & _] (reset! sent notif))
              (notification/notify-advisory! advisory)
              (let [email-handler (first (filter #(= :channel/email (:channel_type %)) (:handlers @sent)))]
                (is (= 1 (count (:recipients email-handler))))
                (is (= :notification-recipient/external-email
                       (:type (first (:recipients email-handler)))))))))))))

(deftest slack-handler-included-when-configured-test
  (testing "Slack handler is added when channel is set and slack token is valid"
    (let [sent (atom nil)]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-SLACK-001"
                                        :severity     "critical"
                                        :match_status "active"})]
        (mt/with-temporary-setting-values [slack-token-valid? true]
          (with-redefs [settings/security-center-slack-channel (constantly "#security-alerts")]
            (with-send-redef (fn [notif & _] (reset! sent notif))
              (notification/notify-advisory! advisory)
              (let [slack-handler (first (filter #(= :channel/slack (:channel_type %)) (:handlers @sent)))]
                (is (some? slack-handler))
                (is (= "#security-alerts"
                       (get-in (first (:recipients slack-handler)) [:details :value])))))))))))

(deftest slack-handler-omitted-when-not-configured-test
  (testing "no Slack handler when security-center-slack-channel is nil"
    (let [sent (atom nil)]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-SLACK-002"
                                        :severity     "low"
                                        :match_status "active"})]
        (with-redefs [settings/security-center-slack-channel (constantly nil)]
          (with-send-redef (fn [notif & _] (reset! sent notif))
            (notification/notify-advisory! advisory)
            (is (empty? (filter #(= :channel/slack (:channel_type %)) (:handlers @sent))))))))))

(deftest slack-handler-omitted-when-token-invalid-test
  (testing "no Slack handler when slack token is not valid"
    (let [sent (atom nil)]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-SLACK-003"
                                        :severity     "medium"
                                        :match_status "active"})]
        (mt/with-temporary-setting-values [slack-token-valid? false]
          (with-redefs [settings/security-center-slack-channel (constantly "#alerts")]
            (with-send-redef (fn [notif & _] (reset! sent notif))
              (notification/notify-advisory! advisory)
              (is (empty? (filter #(= :channel/slack (:channel_type %)) (:handlers @sent)))))))))))

;;; -------------------------------------------- Test notification ----------------------------------------------------

(deftest send-test-notification-sends-via-pipeline-test
  (testing "send-test-notification! sends a notification with test advisory data"
    (let [sent (atom nil)]
      (with-send-redef (fn [notif & _] (reset! sent notif))
        (notification/send-test-notification!)
        (is (= :notification/system-event (:payload_type @sent)))
        (is (= :event/security-advisory-match (get-in @sent [:payload :event_topic])))
        (let [obj (get-in @sent [:payload :event_info :object])]
          (is (= "TEST-0000" (:advisory_id obj)))
          (is (= :medium (:severity obj)))
          (is (re-find #"(?i)test" (:title obj)))
          (is (re-find #"(?i)test" (:description obj))))))))

(deftest send-test-notification-does-not-publish-event-test
  (testing "send-test-notification! does not publish an audit event"
    (let [published (atom [])]
      (with-redefs [events/publish-event!               (fn [topic _] (swap! published conj topic))
                    channel.settings/email-configured?   (constantly true)
                    notification.send/send-notification! (constantly nil)]
        (notification/send-test-notification!)
        (is (empty? @published))))))

(deftest send-test-notification-throws-when-no-channels-test
  (testing "send-test-notification! throws when no channels are configured"
    (with-redefs [channel.settings/email-configured?           (constantly false)
                  settings/security-center-slack-channel        (constantly nil)]
      (is (thrown-with-msg? Exception #"No notification channels are configured"
                            (notification/send-test-notification!))))))

;;; -------------------------------------------- Notification payload -------------------------------------------------

(deftest notification-payload-structure-test
  (testing "build-notification produces correct payload structure"
    (let [sent (atom nil)]
      (mt/with-temp [:model/SecurityAdvisory advisory
                     (advisory-fixture {:advisory_id  "SC-STRUCT-001"
                                        :severity     "high"
                                        :match_status "active"
                                        :title        "RCE in widget parser"
                                        :description  "Remote code execution"})]
        (with-send-redef (fn [notif & _] (reset! sent notif))
          (notification/notify-advisory! advisory)
          (is (= :notification/system-event (:payload_type @sent)))
          (is (= :event/security-advisory-match (get-in @sent [:payload :event_topic])))
          (let [obj (get-in @sent [:payload :event_info :object])]
            (is (= "SC-STRUCT-001" (:advisory_id obj)))
            (is (= :high (:severity obj)))
            (is (= :active (:match_status obj)))
            (is (= "RCE in widget parser" (:title obj)))
            (is (= "Remote code execution" (:description obj)))))))))
