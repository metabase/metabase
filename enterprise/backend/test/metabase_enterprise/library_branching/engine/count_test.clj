(ns metabase-enterprise.library-branching.engine.count-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.count :as count]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

(deftest ^:parallel count-by-kind-test
  (testing "every kind has a count, 0 when the snapshot has no item of it"
    (is (= {:collection 0 :dashboard 0 :glossary-term 0 :measure 0 :metric 0 :model 0 :published-table 0 :question 0
            :segment 0 :snippet 0 :timeline 0}
           (count/count-by-kind {}))))
  (testing "each item counts once, for its kind"
    (let [lib (engine.tu/eid "lib")]
      (is (= {:collection 1 :dashboard 0 :glossary-term 0 :measure 0 :metric 2 :model 0 :published-table 1 :question 0
              :segment 0 :snippet 0 :timeline 0}
             (count/count-by-kind {lib                                   (engine.tu/item :collection "Library" nil)
                                   (engine.tu/eid "m1")                  (engine.tu/item :metric "A" lib)
                                   (engine.tu/eid "m2")                  (engine.tu/item :metric "A" lib)
                                   ["Sample Database" "PUBLIC" "ORDERS"] (engine.tu/item :published-table "O" lib)})))))
  (testing "`kinds` names the kinds that get a count of 0"
    (is (= {:metric 0} (count/count-by-kind {} #{:metric})))))

(defspec count-by-kind-laws-test 100
  (prop/for-all [s (lb.tu/arbitrary-snapshot-gen {:max-items 30})]
    (let [counts (count/count-by-kind s)]
      (and (= snapshot/kinds (set (keys counts)))
           (= (clojure.core/count s) (reduce + (vals counts)))
           (every? (fn [[kind n]] (= n (clojure.core/count (filter #(= kind (:kind %)) (vals s))))) counts)))))

(def mutations
  "Each mutation removes one rule of the count."
  [{:name   :no-zeros
    :doc    "A kind with no item has no count."
    :target `count/count-by-kind
    :edits  [[:replace '(zipmap kinds (repeat 0)) {}]]}])

(deftest count-mutations-test
  (mut/check mutations {:tests [#'count-by-kind-test #'count-by-kind-laws-test]}))
