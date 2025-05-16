(ns metabase.parameters.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.api-test :as api.dashboard-test]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [toucan2.core :as t2]))

(deftest ^:parallel param->fields-test
  (testing "param->fields"
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
      (let [dashboard (t2/hydrate dashboard :resolved-params)]
        (testing "Should correctly retrieve fields"
          (is (=? [{:op := :options nil}]
                  (#'parameters.dashboard/param->fields (get-in dashboard [:resolved-params "_CATEGORY_NAME_"]))))
          (is (=? [{:op :contains :options {:case-sensitive false}}]
                  (#'parameters.dashboard/param->fields (get-in dashboard [:resolved-params "_CATEGORY_CONTAINS_"])))))))))

(deftest ^:parallel chain-filter-constraints-test
  (testing "chain-filter-constraints"
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
      (let [dashboard (t2/hydrate dashboard :resolved-params)]
        (testing "Should return correct constraints with =/!="
          (is (=? [{:op := :value "ood" :options nil}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_CATEGORY_NAME_" "ood"})))
          (is (=? [{:op :!= :value "ood" :options nil}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_NOT_CATEGORY_NAME_" "ood"}))))
        (testing "Should return correct constraints with a few filters"
          (is (=? [{:op := :value "foo" :options nil}
                   {:op :!= :value "bar" :options nil}
                   {:op :contains :value "buzz" :options {:case-sensitive false}}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_CATEGORY_NAME_"     "foo"
                                                                              "_NOT_CATEGORY_NAME_" "bar"
                                                                              "_CATEGORY_CONTAINS_" "buzz"}))))
        (testing "Should ignore incorrect/unknown filters"
          (is (= []
                 (#'parameters.dashboard/chain-filter-constraints dashboard {"qqq" "www"}))))))))

(deftest ^:parallel combined-chained-filter-results-test
  (testing "dedupes and sort by value, then by label if exists"
    (is (= [[1] [2 "B"] [3] [4 "A"] [5 "C"] [6 "D"]]
           (#'parameters.dashboard/combine-chained-filter-results
            [{:values [[1] [2] [4]]}
             {:values [[4 "A"] [5 "C"] [6 "D"]]}
             {:values [[1] [2] [3]]}
             {:values [[4 "A"] [2 "B"] [5 "C"]]}])))))
