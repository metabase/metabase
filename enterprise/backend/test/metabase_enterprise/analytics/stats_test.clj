(ns metabase-enterprise.analytics.stats-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.analytics.stats :as ee-stats]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.analytics.stats :as stats]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ee-snowplow-features-test
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

(deftest ee-transform-metrics-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with no transforms"
      (is (=? {:transforms 0 :transform_runs_last_24h 0}
              (ee-stats/ee-transform-metrics))))
    (testing "with transforms"
      (mt/with-temp [:model/Transform transform {:target {:database (mt/id)
                                                          :table "test_table"}
                                                 :name "Test SQL transform"
                                                 :source {:type "query"
                                                          :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}
                     :model/TransformRun _ {:start_time (t/minus (t/offset-date-time) (t/hours 1))
                                            :transform_id (:id transform)}]
        (is (=? {:transforms 1 :transform_runs_last_24h 1}
                (ee-stats/ee-transform-metrics))))
      (testing "with old transform runs"
        (mt/with-temp [:model/Transform transform {:target {:database (mt/id)
                                                            :table "test_table"}
                                                   :name "Test SQL transform"
                                                   :source {:type "query"
                                                            :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}
                       :model/TransformRun _ {:start_time (t/minus (t/offset-date-time) (t/hours 25))
                                              :transform_id (:id transform)}]
          (is (zero? (:transform_runs_last_24h (ee-stats/ee-transform-metrics)))))))))
