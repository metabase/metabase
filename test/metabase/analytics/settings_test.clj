(ns metabase.analytics.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest instance-creation-test
  (let [original-value (t2/select-one-fn :value :model/Setting :key "instance-creation")]
    (try
      (testing "Instance creation timestamp is set only once when setting is first fetched"
        (t2/delete! :model/Setting :key "instance-creation")
        (with-redefs [analytics.settings/first-user-creation (constantly nil)]
          (let [first-value (analytics.settings/instance-creation)]
            (Thread/sleep 10) ;; short sleep since java.time.Instant is not necessarily monotonic
            (is (= first-value
                   (analytics.settings/instance-creation))))))
      (testing "If a user already exists, we should use the first user's creation timestamp"
        (mt/with-test-user :crowberto
          (t2/delete! :model/Setting :key "instance-creation")
          (let [first-user-creation (:min (t2/select-one ['User [:%min.date_joined :min]]))
                instance-creation   (analytics.settings/instance-creation)]
            (is (= (u.date/format-rfc3339 first-user-creation)
                   instance-creation)))))
      (finally
        (when original-value
          (t2/update! :model/Setting {:key "instance-creation"} {:value original-value}))))))

(deftest analytics-pii-retention-enabled-feature-gate-test
  (testing "analytics-pii-retention-enabled is gated behind the :audit-app premium feature"
    (testing "with :audit-app, the setting can be read and written"
      (mt/with-premium-features #{:audit-app}
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
          (analytics.settings/analytics-pii-retention-enabled! true)
          (is (true? (analytics.settings/analytics-pii-retention-enabled))))))
    (testing "without :audit-app, reads return the default and writes throw"
      (mt/with-premium-features #{}
        (is (false? (analytics.settings/analytics-pii-retention-enabled)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting analytics-pii-retention-enabled is not enabled because feature :audit-app is not available"
             (analytics.settings/analytics-pii-retention-enabled! true)))))))
