(ns metabase-enterprise.sandbox.referenced-entities-test
  "Dynamic goal queries run as the signed-in user, so sandboxing applies to them like to any query the user runs."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query
                                                            {:namespaces [metabase-enterprise.sandbox.referenced-entities-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]))

(deftest sandboxed-referenced-card-test
  (testing "a signed-in user's goal query is sandboxed like any query they run"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $category_id 50]})}}}
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (letfn [(goal-rows [user]
                  (-> (mt/user-http-request user :post 202 "dataset"
                                            (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                                                   :referenced_entities [{:type "card" :id goal-id}]))
                      (get-in [:data :referenced_entities :card goal-id :data :rows])))]
          (testing "an admin counts every venue"
            (is (= [[100]] (goal-rows :crowberto))))
          (testing "a sandboxed user counts only the venues their sandbox lets through"
            (is (= [[10]] (goal-rows :rasta)))))))))
