(ns metabase-enterprise.analytics.stats-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
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
          oss-features (map :name (@#'stats/default-ee-snowplow-features-data))]
      (is (= (sort ee-features) (sort oss-features))))))

(deftest ^:parallel ee-snowplow-settings-test
  (testing "Every setting returned by `ee-snowplow-settings-data` has a corresponding OSS fallback with the same tags"
    (is (= (map #(dissoc % :value) (@#'stats/default-ee-snowplow-settings-data))
           (map #(dissoc % :value) (ee-stats/ee-snowplow-settings-data))))))

(deftest ee-snowplow-features-sandboxes-test
  (testing "the sandboxes entry is available with the feature and a SQL database"
    (mt/id)
    (mt/id)
    (mt/with-premium-features #{:official-collections}
      (is (=? {:name :sandboxes :available true}
              (m/find-first (comp #{:sandboxes} :name) (ee-stats/ee-snowplow-features-data)))))))

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
