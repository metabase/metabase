(ns metabase-enterprise.analytics.stats-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.analytics.stats :as ee-stats]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.analytics.stats :as stats]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel ee-snowplow-features-test
  (testing "Every feature returned by `ee-snowplow-features-data` has a corresponding OSS fallback"
    (let [ee-features (map :name (ee-stats/ee-snowplow-features-data))
          oss-features (map :name (@#'stats/ee-snowplow-features-data'))]
      (is (= (sort ee-features) (sort oss-features))))))

(deftest metabase-analytics-metrics-test
  (testing "Metabase Analytics doesn't contribute to stats"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (is (= ::ee-audit/installed (ee-audit/ensure-audit-db-installed!)))
      (testing "sense check: Collection, Dashboard, and Cards exist"
        (is (true? (t2/exists? :model/Collection)))
        (is (true? (t2/exists? :model/Dashboard)))
        (is (true? (t2/exists? :model/Card))))
      (testing "All metrics should be empty"
        (is (= {:collections 0, :cards_in_collections 0, :cards_not_in_collections 0, :num_cards_per_collection {}}
               (#'stats/collection-metrics)))
        (is (= {:questions {}, :public {}, :embedded {}}
               (#'stats/question-metrics)))
        (is (= {:dashboards         0
                :with_params        0
                :num_dashs_per_user {}
                :num_cards_per_dash {}
                :num_dashs_per_card {}
                :public             {}
                :embedded           {}}
               (#'stats/dashboard-metrics)))))))

(deftest ee-snowplow-settings-deadline-test
  (testing "the `:required` grace period is reported as a state rather than the admin's chosen timestamp"
    (mt/with-premium-features #{:multi-factor-auth}
      (testing "no deadline configured"
        (mt/with-temporary-setting-values [mfa-requirement-deadline nil]
          (is (= [{:key   "mfa_requirement_deadline"
                   :value "unset"
                   :tags  ["auth" "mfa"]}]
                 (ee-stats/ee-snowplow-settings-data)))))
      (testing "deadline still in the future, so enforcement has not begun"
        (mt/with-temporary-setting-values [mfa-requirement-deadline (t/plus (t/offset-date-time) (t/days 7))]
          (is (=? [{:value "pending"}]
                  (ee-stats/ee-snowplow-settings-data)))))
      (testing "deadline elapsed, so enforcement is live"
        (mt/with-temporary-setting-values [mfa-requirement-deadline (t/minus (t/offset-date-time) (t/days 1))]
          (is (=? [{:value "passed"}]
                  (ee-stats/ee-snowplow-settings-data))))))))

(deftest ee-snowplow-settings-survives-license-lapse-test
  (testing "settings are reported without the feature token: enforcement outlives a lapse, so its state still matters"
    (mt/with-premium-features #{}
      (is (= ["mfa_requirement_deadline"]
             (map :key (ee-stats/ee-snowplow-settings-data)))))))

(deftest mfa-enrollment-metrics-test
  (let [one-day-ago (t/minus (t/offset-date-time) (t/days 1))
        metrics     (fn [] (#'stats/mfa-metrics one-day-ago))]
    (testing "a confirmed TOTP enrollment moves a user from the unenrolled count to the enrolled count"
      ;; deltas, not absolutes -- the app DB here is shared with other tests
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [unenrolled (metrics)]
          (mt/with-temp [:model/AuthIdentity _ {:user_id      user-id
                                                :provider     "totp"
                                                :confirmed_at (t/instant)
                                                :credentials  {:secret "ABCDEFGHIJKLMNOP"}}]
            (let [enrolled (metrics)]
              (is (= (inc (:mfa_enrolled_users unenrolled))
                     (:mfa_enrolled_users enrolled)))
              (is (= (dec (:mfa_unenrolled_users unenrolled))
                     (:mfa_unenrolled_users enrolled))))))))
    (testing "a started-but-unconfirmed enrollment does not count as enrolled"
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [before (metrics)]
          (mt/with-temp [:model/AuthIdentity _ {:user_id     user-id
                                                :provider    "totp"
                                                :credentials {:secret "ABCDEFGHIJKLMNOP"}}]
            (let [after (metrics)]
              (is (= (:mfa_enrolled_users before)
                     (:mfa_enrolled_users after)))
              (is (= (:mfa_unenrolled_users before)
                     (:mfa_unenrolled_users after))))))))))
