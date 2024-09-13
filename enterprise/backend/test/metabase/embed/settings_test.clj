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

(defspec enable-embedding-SDK-true=>app-origin-ignores-localhosts
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (embed.settings/enable-embedding-sdk! true)
    (prop/for-all [localhost-origins (mg/generator [:sequential (into [:enum "localhost:*"] (map #(str "localhost:" %) (range 1000)))])]
      (let [origin-value (str/join " " localhost-origins)]
        (embed.settings/embedding-app-origins-sdk! origin-value)
        ;; All localhosty origins should be ignored, so the result should be "localhost:*"
        (= "localhost:*" (embed.settings/embedding-app-origins-sdk))))))

(def ^:private other-ip "1.2.3.4:1234")

(defspec enable-embedding-SDK-false=>app-origin-ignores-localhosts-but-keeps-other-ip
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (embed.settings/enable-embedding-sdk! true)
    (prop/for-all [origins (mg/generator [:sequential (into [:enum other-ip "localhost:*"] (map #(str "localhost:" %) (range 1000)))])]
      (let [origin-value (str/join " " origins)]
        (embed.settings/embedding-app-origins-sdk! origin-value)
        (if (str/includes? origin-value other-ip)
          (= (str "localhost:* " other-ip) (embed.settings/embedding-app-origins-sdk))
          (= "localhost:*" (embed.settings/embedding-app-origins-sdk)))))))
