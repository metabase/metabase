(ns metabase.explorations.summary-document-checks-cost-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "Rasta's answers of `check` for the first `n` of the Documents with `ids` selected in one request, and the number of
  queries the checks ran."
  [ids check n]
  (request/with-current-user (mt/user->id :rasta)
    (let [documents (t2/select :model/Document :id [:in (take n ids)] {:order-by [[:id :asc]]})]
      (t2/with-call-count [call-count]
        [(mapv check documents) (call-count)]))))

(deftest summary-document-checks-cost-test
  (testing "checks of Summary documents of different explorations cost the same for two documents as for three"
    (mt/with-temp [:model/Collection        c1 {}
                   :model/Collection        c2 {}
                   :model/Collection        c3 {}
                   :model/Exploration       x1 {:collection_id (:id c1)}
                   :model/Exploration       x2 {:collection_id (:id c2)}
                   :model/Exploration       x3 {:collection_id (:id c3)}
                   :model/ExplorationThread _  {:exploration_id (:id x1)}
                   :model/ExplorationThread _  {:exploration_id (:id x2)}
                   :model/ExplorationThread _  {:exploration_id (:id x3)}
                   :model/Document          d1 {:collection_id (:id c1) :exploration_id (:id x1)}
                   :model/Document          d2 {:collection_id (:id c2) :exploration_id (:id x2)}
                   :model/Document          d3 {:collection_id (:id c3) :exploration_id (:id x3)}]
      (let [ids (map :id [d1 d2 d3])]
        (doseq [check [mi/can-read? mi/can-write?]]
          (check-cost ids check 2)
          (let [[two two-count] (check-cost ids check 2)
                [all all-count] (check-cost ids check 3)]
            (testing check
              (is (= [true true true] all))
              (is (= two (take 2 all)))
              (is (= two-count all-count)))))))))
