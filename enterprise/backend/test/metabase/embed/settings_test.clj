(ns metabase.embed.settings-test
  (:require
   [clojure.test :refer :all]
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
