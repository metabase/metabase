(ns metabase.analytics.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest instance-creation-test
  (let [original-value (t2/select-one-fn :value :model/Setting :key "instance-creation")]
    (try
      (testing "Instance creation timestamp is set only once when setting is first fetched"
        (t2/delete! :model/Setting :key "instance-creation")
        (mt/with-dynamic-fn-redefs [analytics.settings/first-user-creation (constantly nil)]
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

(deftest metaplow-url-default-test
  (testing "In production run mode the collector URL defaults to the Metabase Track collector"
    (with-redefs [config/is-prod? true]
      (is (= "https://product-analytics-ingestion.metabase.com/api/send"
             (#'analytics.settings/default-metaplow-url)))))
  (testing "In dev, test and e2e run modes there is no default, so those runs send nothing"
    (with-redefs [config/is-prod? false]
      (is (nil? (#'analytics.settings/default-metaplow-url))))))

(deftest metaplow-url-is-unset-outside-production-test
  (testing "There is no default in this run mode, so the setting resolves as unset"
    (is (nil? (analytics.settings/metaplow-url)))
    ;; a blank env var value is treated as absent, so this is also what a run with `MB_METAPLOW_URL=` resolves to
    (mt/with-temp-env-var-value! [mb-metaplow-url ""]
      (is (nil? (analytics.settings/metaplow-url)))
      (is (false? (analytics.settings/metaplow-tracking-enabled))))))

(deftest metaplow-url-air-gap-test
  (mt/with-temporary-setting-values [anon-tracking-enabled true
                                     metaplow-url          nil]
    (with-redefs [config/is-prod? true]
      (testing "In production run mode with nothing set, the Metabase Track collector is the default"
        (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)]
          (is (= "https://product-analytics-ingestion.metabase.com/api/send"
                 (analytics.settings/metaplow-url)))
          (is (true? (analytics.settings/metaplow-tracking-enabled)))))
      (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly true)]
        (testing "An air-gapped instance gets no default collector, so nothing is sent"
          (is (nil? (analytics.settings/metaplow-url)))
          (is (false? (analytics.settings/metaplow-tracking-enabled))))
        (testing "An air-gapped instance still sends to an explicitly set collector"
          (mt/with-temporary-setting-values [metaplow-url "https://collector.example.com/api/send"]
            (is (= "https://collector.example.com/api/send"
                   (analytics.settings/metaplow-url)))
            (is (true? (analytics.settings/metaplow-tracking-enabled)))))
        (testing "...including one set by env var"
          (mt/with-temp-env-var-value! [mb-metaplow-url "https://env-collector.example.com/api/send"]
            (is (= "https://env-collector.example.com/api/send"
                   (analytics.settings/metaplow-url)))
            (is (true? (analytics.settings/metaplow-tracking-enabled)))))))))

(deftest metaplow-tracking-enabled-test
  (testing "Metabase Track is on when anonymous tracking is on and a collector URL resolves"
    (mt/with-temporary-setting-values [anon-tracking-enabled true
                                       metaplow-url          "https://collector.example.com/api/send"]
      (is (true? (analytics.settings/metaplow-tracking-enabled))))))

(deftest anon-tracking-opt-out-suppresses-both-destinations-test
  (testing "Turning anonymous tracking off suppresses Metabase Track as well as Snowplow"
    (mt/with-temporary-setting-values [anon-tracking-enabled false
                                       metaplow-url          "https://collector.example.com/api/send"
                                       snowplow-available    true]
      (is (false? (analytics.settings/metaplow-tracking-enabled)))
      (is (false? (analytics.settings/snowplow-enabled))))))
