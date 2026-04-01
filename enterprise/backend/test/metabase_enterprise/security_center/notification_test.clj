(ns metabase-enterprise.security-center.notification-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase-enterprise.security-center.task.notify :as task.notify]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
          :published_at      #t "2026-03-24T00:00:00Z"}
         overrides))

;; Mock notify-advisory! to just record calls — avoids sending real emails/events
(defn- with-notify-spy! [f]
  (let [notified (atom [])]
    (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj a))]
      (f notified))))

(deftest evaluate-advisory-triggers-notification-test
  (testing "notification is triggered when status transitions to active"
    (with-notify-spy!
      (fn [notified]
        (mt/with-temp [:model/SecurityAdvisory advisory
                       (advisory-fixture {:advisory_id  "SC-NOTIFY-001"
                                          :match_status "not_affected"})]
          ;; Mock the query to return true (matched)
          (with-redefs [matching/execute-matching-query! (constantly true)]
            (matching/evaluate-advisory! advisory)
            (is (= 1 (count @notified)))
            (is (= "SC-NOTIFY-001" (:advisory_id (first @notified))))
            (is (= :active (:match_status (first @notified)))))))))

  (testing "notification is triggered when status transitions to error"
    (with-notify-spy!
      (fn [notified]
        (mt/with-temp [:model/SecurityAdvisory advisory
                       (advisory-fixture {:advisory_id  "SC-NOTIFY-002"
                                          :match_status "not_affected"})]
          (with-redefs [matching/execute-matching-query! (constantly :error)]
            (matching/evaluate-advisory! advisory)
            (is (= 1 (count @notified)))
            (is (= :error (:match_status (first @notified)))))))))

  (testing "no notification when status stays the same"
    (with-notify-spy!
      (fn [notified]
        (mt/with-temp [:model/SecurityAdvisory advisory
                       (advisory-fixture {:advisory_id  "SC-NOTIFY-003"
                                          :match_status "active"})]
          (with-redefs [matching/execute-matching-query! (constantly true)]
            (matching/evaluate-advisory! advisory)
            (is (empty? @notified)))))))

  (testing "no notification when status transitions to not_affected"
    (with-notify-spy!
      (fn [notified]
        (mt/with-temp [:model/SecurityAdvisory advisory
                       (advisory-fixture {:advisory_id  "SC-NOTIFY-004"
                                          :match_status "active"})]
          (with-redefs [matching/execute-matching-query! (constantly false)]
            (matching/evaluate-advisory! advisory)
            (is (empty? @notified))))))))

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
              (task.notify/send-repeat-notifications!)
              (is (= ["SC-REPEAT-001"] @notified))))))

      (testing "critical advisories: too soon — no repeat"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-002"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/hours 12))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.notify/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "high severity: weekly cadence"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-003"
                                            :severity         "high"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 8))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.notify/send-repeat-notifications!)
              (is (= ["SC-REPEAT-003"] @notified))))))

      (testing "high severity: too soon — no repeat"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-004"
                                            :severity         "high"
                                            :match_status     "active"
                                            :last_notified_at (t/minus (t/offset-date-time) (t/days 3))})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.notify/send-repeat-notifications!)
              (is (empty? @notified))))))

      (testing "never-notified advisory is always due"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-REPEAT-005"
                                            :severity         "low"
                                            :match_status     "active"
                                            :last_notified_at nil})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.notify/send-repeat-notifications!)
              (is (= ["SC-REPEAT-005"] @notified)))))))))

(deftest acknowledged-advisories-not-notified-test
  (with-clean-advisories
    (fn []
      (testing "acknowledged advisories are excluded from repeat notifications"
        (let [notified (atom [])]
          (mt/with-temp [:model/SecurityAdvisory _advisory
                         (advisory-fixture {:advisory_id      "SC-ACK-001"
                                            :severity         "critical"
                                            :match_status     "active"
                                            :last_notified_at nil
                                            :acknowledged_by  (mt/user->id :crowberto)
                                            :acknowledged_at  (mi/now)})]
            (with-redefs [notification/notify-advisory! (fn [a] (swap! notified conj (:advisory_id a)))]
              (task.notify/send-repeat-notifications!)
              (is (empty? @notified)))))))))
