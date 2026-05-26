(ns metabase.analytics.metaplow-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.metaplow :as metaplow]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.version.core :as version])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest build-payload-test
  (testing "Schemas with an `:event` key produce `<schema>.<event>` and the event key is removed from data"
    (let [payload (#'metaplow/build-payload :snowplow/dashboard
                                            {:event :dashboard-created :dashboard-id 42 :num-tabs 1})]
      (is (=? {:type    "event"
               :payload {:name "dashboard.dashboard_created"
                         :data {"dashboard_id" 42
                                "num_tabs"     1}}}
              payload))
      (is (not (contains? (get-in payload [:payload :data]) "event")))))
  (testing "Schemas without an `:event` key produce `<schema>` and keep the full payload"
    (is (=? {:payload {:name "instance_stats"
                       :data {"metric_one" 1
                              "metric_two" 2}}}
            (#'metaplow/build-payload :snowplow/instance_stats {:metric_one 1 :metric_two 2}))))
  (testing "Top-level payload has the expected keys: website / id / hostname / tag / name / data"
    (let [{:keys [payload]} (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created})]
      (is (= #{:website :id :hostname :tag :name :data} (set (keys payload))))
      (is (=? {:website  string?
               :id       (analytics.settings/analytics-uuid)
               :hostname "anonymous.metabase.com"
               :tag      "metabase-instance"}
              payload))))
  (testing "`data` is enriched with version_tag and plan on every event"
    (is (=? {:payload {:data {"version_tag" (:tag (version/version))
                              "plan"        string?}}}
            (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created}))))
  (testing "Keyword keys and values become snake_case strings"
    (is (=? {:payload {:name "database.database_connection_successful"
                       :data {"database"    "postgres"
                              "database_id" 1
                              "source"      "admin"}}}
            (#'metaplow/build-payload :snowplow/database
                                      {:event       :database-connection-successful
                                       :database    :postgres
                                       :database-id 1
                                       :source      :admin}))))
  (testing "hostname matches the FE's anonymized constant regardless of site-url"
    (mt/with-temporary-setting-values [site-url "https://stats.metabase.com/"]
      (is (=? {:payload {:hostname "anonymous.metabase.com"}}
              (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created}))))))

(deftest tracking-disabled-test
  (testing "When metaplow-tracking-enabled is false the event is not enqueued and the call returns false"
    (mt/with-temporary-setting-values [metaplow-url nil]
      (let [collector (atom [])]
        (with-redefs [metaplow/enqueue! (fn [payload]
                                          (swap! collector conj payload)
                                          true)]
          (is (false? (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created})))
          (is (empty? @collector)))))))

(deftest pipeline-integration-test
  (mt/with-temporary-setting-values [metaplow-url "http://fake-metaplow/api/send"
                                     anon-tracking-enabled true]
    (testing "track-event! enqueues onto the real channel and the pipeline worker invokes send-event-with-retries!"
      (let [received (promise)]
        (with-redefs [metaplow/send-event-with-retries! (fn [payload]
                                                          (deliver received payload)
                                                          :sent)]
          (is (true? (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id 7})))
          (let [payload (deref received 1000 ::timeout)]
            (is (not= ::timeout payload)
                "Worker did not consume the event within 1s")
            (when (not= ::timeout payload)
              (is (=? {:type    "event"
                       :payload {:name "dashboard.dashboard_created"
                                 :data {"dashboard_id" 7}}}
                      payload)))))))
    (testing "Sending 200 events: all of them traverse the pipeline"
      (let [received (atom [])
            latch    (CountDownLatch. 200)]
        (with-redefs [metaplow/send-event-with-retries! (fn [payload]
                                                          (swap! received conj payload)
                                                          (.countDown latch)
                                                          :sent)]
          (doseq [i (range 200)]
            (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id i}))
          (is (true? (.await latch 1 TimeUnit/SECONDS))
              "Pipeline did not process all 200 events within 1s")
          (is (= 200 (count @received)))
          (is (= (set (range 200))
                 (set (map #(get-in % [:payload :data "dashboard_id"]) @received)))))))))
