(ns metabase-enterprise.analytics.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.analytics.stats :as stats]
   [metabase.db :as mdb]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
