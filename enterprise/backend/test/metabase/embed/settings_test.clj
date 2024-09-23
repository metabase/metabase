(ns metabase.embed.settings-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [malli.generator :as mg]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.embed.settings :as embed.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest enable-embedding-test
  (testing "A snowplow event is sent whenever embedding is enabled or disabled"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:embedding}
        (mt/with-temporary-setting-values [enable-embedding     false
                                           embedding-app-origin "https://example.com"]
          (let [embedded-dash-count (t2/count :model/Dashboard :enable_embedding true)
                embedded-card-count (t2/count :model/Card :enable_embedding true)
                expected-payload    {"embedding_app_origin_set"   true
                                     "number_embedded_questions"  embedded-card-count
                                     "number_embedded_dashboards" embedded-dash-count}]
            (snowplow-test/with-fake-snowplow-collector
              (embed.settings/enable-embedding! true)
              (is (= [{:data
                       (merge expected-payload {"event" "embedding_enabled"})
                       :user-id (str (mt/user->id :crowberto))}]
                     (-> (snowplow-test/pop-event-data-and-user-id!))))

              (embed.settings/enable-embedding! false)
              (is (= [{:data
                       (merge expected-payload {"event" "embedding_disabled"})
                       :user-id (str (mt/user->id :crowberto))}]
                     (-> (snowplow-test/pop-event-data-and-user-id!)))))))))))

(def ^:private other-ip "1.2.3.4:1234")

(deftest enable-embedding-SDK-true-ignores-localhosts
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (embed.settings/enable-embedding-sdk! true)
    (let [origin-value "localhost:*"]
      (embed.settings/embedding-app-origins-sdk! origin-value)
      (testing "All localhosty origins should be ignored, so the result should be \"localhost:*\""
        (embed.settings/embedding-app-origins-sdk! (str origin-value " localhost:8080"))
        (is (= "localhost:*" (embed.settings/embedding-app-origins-sdk))))
      (testing "Normal ips are added to the list"
        (embed.settings/embedding-app-origins-sdk! (str origin-value " " other-ip))
        (is (= (str "localhost:* " other-ip) (embed.settings/embedding-app-origins-sdk)))))))

(deftest enable-embedding-SDK-false-returns-nothing
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (embed.settings/enable-embedding-sdk! true)
    (let [origin-value (str "localhost:* 1.2.3.4:5555 "
                            (str/join " " (map #(str "localhost:" %) (range 1000 2000))))]
      (embed.settings/embedding-app-origins-sdk! origin-value)
      (is (= (str "localhost:* " other-ip) (embed.settings/embedding-app-origins-sdk))))))

(defspec enable-embedding-SDK-false=>app-origin-ignores-localhosts-but-keeps-other-ip
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (embed.settings/enable-embedding-sdk! true)
    (prop/for-all [origins (mg/generator [:sequential
                                          (into [:enum other-ip "localhost:*"]
                                                (map #(str "localhost:" %) (range 1000 2000)))])]
      (let [origin-value (str/join " " origins)]
        (embed.settings/embedding-app-origins-sdk! origin-value)
        (if (str/includes? origin-value other-ip)
          (= (str "localhost:* " other-ip) (embed.settings/embedding-app-origins-sdk))
          (= "localhost:*" (embed.settings/embedding-app-origins-sdk)))))))
