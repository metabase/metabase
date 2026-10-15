(ns metabase-enterprise.library-branching.mutation.demo-test
  "The demo of the mutation harness: tests of a tiny pure function, and mutations of it declared as data next to
  them."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.mutation.demo :as demo]))

(deftest plan-writes-test
  (testing "an item that theirs changed and mine holds at its base is written"
    (is (= #{:a} (demo/plan-writes {:a 1} {:a 1} {:a 2}))))
  (testing "an item that theirs adds is written"
    (is (= #{:c} (demo/plan-writes {} {} {:c 1}))))
  (testing "an item with a local change is never written, whatever theirs did"
    (is (= #{} (demo/plan-writes {:a 1 :b 1} {:a 2 :b 2} {:a 3 :b 1})))))

(def mutations
  "Each mutation removes or weakens one rule of `demo/plan-writes`, as a TLA+ mutation removes one rule of a design."
  [{:name   :nowitness
    :doc    "The plan no longer checks that mine still holds the base content, so a pull overwrites a local change."
    :target `demo/plan-writes
    :edits  [[:replace '(= (get base id) (get mine id)) true]]}
   {:name   :unsorted
    :doc    (str "The plan returns a hash set. The docstring promises a sorted set, but the tests compare with `=`, "
                 "so no test pins the order. A surviving mutation shows such a gap; a card closes it with a test, "
                 "or declares it expected, as here.")
    :target `demo/plan-writes
    :edits  [[:replace '(sorted-set) #{}]]
    :expect :survived}])

(deftest plan-writes-mutations-test
  (let [results (mut/check mutations {:tests [#'plan-writes-test]})]
    (testing "the report has a row for each mutation, with its result"
      (when (seq results)
        (let [report (mut/report results)]
          (is (re-find #"\| :nowitness \| .*\| killed \| killed \|" report))
          (is (re-find #"\| :unsorted \| .*\| survived \| survived \|" report)))))))
