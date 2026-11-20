(ns metabase-enterprise.sandbox.dynamic-goals-test
  "Signed-in goal sources run as the current user, so sandboxing applies to them like to any query the user runs."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query
                                                            {:namespaces [metabase-enterprise.sandbox.dynamic-goals-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.dynamic-goals.core :as dynamic-goals]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest sandboxed-goal-source-test
  (testing "a signed-in user's goal source is sandboxed like any query they run"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $category_id 50]})}}}
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (letfn [(goal-rows [user]
                  (-> (mt/user-http-request user :post 202 "dynamic-goal/values"
                                            {:sources [{:type "card" :id goal-id}]})
                      (get-in [:card goal-id :data :rows])))]
          (testing "an admin counts every venue"
            (is (= [[100]] (goal-rows :crowberto))))
          (testing "a sandboxed user counts only the venues their sandbox lets through"
            (is (= [[10]] (goal-rows :rasta)))))))))

(deftest sandboxed-chart-goal-values-test
  (testing "in-process callers run a saved chart's goals under the caller's sandboxes"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $category_id 50]})}}}
      (mt/with-temp [:model/Card {goal-id :id}  {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card {chart-id :id} {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                                                 :display                :line
                                                 :visualization_settings {:graph.show_goal  true
                                                                          :graph.goal_value {:id     goal-id
                                                                                             :type   "card"
                                                                                             :column "count"}}}]
        (is (= [[10]] (-> (mt/with-current-user (mt/user->id :rasta)
                            (dynamic-goals/chart-goal-values (t2/select-one :model/Card :id chart-id) nil))
                          (get-in ["card" (str goal-id) :data :rows]))))))))
