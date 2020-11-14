(ns metabase-enterprise.sandbox.api.dashboard-test
  "Tests for special behavior of `/api/metabase/dashboard` endpoints in the Metabase Enterprise Edition."
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase
             [models :refer [Card Dashboard DashboardCard]]
             [test :as mt]]))

(deftest params-values-test
  (testing "Don't return `param_values` for fields to which the user only has segmented access."
    (mt.tu/with-segmented-test-setup mt.tu/restricted-column-query
      (mt.tu/with-user-attributes :rasta {:cat 50}
        (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                        Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                        DashboardCard [{_ :id}            {:dashboard_id       dashboard-id
                                                           :card_id            card-id
                                                           :parameter_mappings [{:card_id      card-id
                                                                                 :parameter_id "foo"
                                                                                 :target       [:dimension [:field_id (mt/id :venues :name)]]}]}]]
          (is (= nil
                 (:param_values ((mt/user->client :rasta) :get 200 (str "dashboard/" dashboard-id))))))))))
