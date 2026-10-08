(ns metabase.analytics.metaplow-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.analytics.metaplow :as metaplow]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.config.core :as config]
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

(deftest tracking-enabled-test
  (let [posted (atom [])
        track! #(metaplow/track-event! :snowplow/dashboard {:event :dashboard-created})]
    (mt/with-dynamic-fn-redefs [metaplow/enqueue! (fn [payload]
                                                    (#'metaplow/send-event! payload)
                                                    true)
                                http/post         (fn [url _request]
                                                    (swap! posted conj url)
                                                    {:status 200})]
      (mt/with-temporary-setting-values [anon-tracking-enabled true
                                         metaplow-url          nil]
        (testing "Outside production nothing is sent until a collector URL is configured"
          (is (false? (track!)))
          (is (empty? @posted)))
        (with-redefs [config/is-prod? true]
          (testing "In production, backend events go to the Metabase Track collector by default"
            (is (true? (track!)))
            (is (= ["https://product-analytics-ingestion.metabase.com/api/send"] @posted)))
          (testing "The frontend only sends to Metaplow when a collector URL is configured"
            (is (false? (analytics.settings/metaplow-tracking-enabled))))
          (testing "Turning anonymous tracking off stops backend events too"
            (mt/with-temporary-setting-values [anon-tracking-enabled false]
              (is (false? (track!)))
              (is (= 1 (count @posted))))))
        (mt/with-temp-env-var-value! [mb-metaplow-url "https://product-analytics-ingestion.staging.metabase.com/api/send"]
          (testing "MB_METAPLOW_URL sends backend and frontend events to another collector"
            (is (true? (track!)))
            (is (= "https://product-analytics-ingestion.staging.metabase.com/api/send" (last @posted)))
            (is (true? (analytics.settings/metaplow-tracking-enabled)))))))))

(deftest pipeline-integration-test
  (mt/with-temporary-setting-values [metaplow-url "http://fake-metaplow/api/send"
                                     anon-tracking-enabled true]
    (testing "track-event! enqueues onto the real channel and the pipeline worker invokes send-event-with-retries!"
      (let [received (promise)]
        ;; the pipeline's worker threads are spawned once from a defonce delay, so they never inherit a
        ;; test's *local-redefs*; only a root swap reaches them
        #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
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
        ;; the pipeline's worker threads are spawned once from a defonce delay, so they never inherit a
        ;; test's *local-redefs*; only a root swap reaches them
        #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
        (with-redefs [metaplow/send-event-with-retries! (fn [payload]
                                                          (swap! received conj payload)
                                                          (.countDown latch)
                                                          :sent)]
          (doseq [i (range 1 201)]
            (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id i}))
          (is (true? (.await latch 1 TimeUnit/SECONDS))
              "Pipeline did not process all 200 events within 1s")
          (is (= 200 (count @received)))
          (is (= (set (range 1 201))
                 (set (map #(get-in % [:payload :data "dashboard_id"]) @received)))))))))
