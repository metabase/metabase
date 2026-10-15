(ns metabase-enterprise.library-branching.engine.diff-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(def ^:private a (engine.tu/eid "a"))
(def ^:private b (engine.tu/eid "b"))
(def ^:private c (engine.tu/eid "c"))
(def ^:private orders ["Sample Database" "PUBLIC" "ORDERS"])

(deftest ^:parallel diff-test
  (let [x {a (engine.tu/item :collection "A" nil)
           b (engine.tu/item :metric "B" a)
           orders (engine.tu/item :published-table "Orders" a)}]
    (testing "equal snapshots have no difference"
      (is (= {:created #{} :deleted #{} :updated #{}} (diff/diff x x))))
    (testing "an item only in the second snapshot is created; one only in the first is deleted"
      (is (= {:created #{c} :deleted #{orders} :updated #{}}
             (diff/diff x (-> x (dissoc orders) (assoc c (engine.tu/item :snippet "C" a)))))))
    (testing "an item is updated iff its content differs, in any part"
      (is (= {:created #{} :deleted #{} :updated #{b}} (diff/diff x (assoc-in x [b :name] "B2"))))
      (is (= {:created #{} :deleted #{} :updated #{b}} (diff/diff x (assoc-in x [b :place] nil))))
      (is (= {:created #{} :deleted #{} :updated #{orders}} (diff/diff x (assoc-in x [orders :refs] #{[:card b]}))))
      (is (= {:created #{} :deleted #{} :updated #{b}} (diff/diff x (assoc-in x [b :attrs :display] "scalar")))))
    (testing "content equality is value equality: a map of another type with equal entries is no change"
      (is (= {:created #{} :deleted #{} :updated #{}}
             (diff/diff x (update x b #(into (sorted-map) %))))))))

(defspec diff-laws-test 100
  (prop/for-all [[x y] (engine.tu/related-snapshots-gen)]
    (let [{:keys [created deleted updated] :as d} (diff/diff x y)]
      (and (= created (set/difference (set (keys y)) (set (keys x))))
           (= deleted (set/difference (set (keys x)) (set (keys y))))
           (= (set/union created deleted updated) (engine.tu/changed x y))
           (empty? (set/intersection updated (set/union created deleted)))
           (= d (let [r (diff/diff y x)] {:created (:deleted r) :deleted (:created r) :updated (:updated r)}))
           (= {:created #{} :deleted #{} :updated #{}} (diff/diff y y))))))

(def mutations
  "Each mutation removes one rule of the diff."
  [{:name   :updated-by-identity
    :doc    "An item that is in both snapshots counts as updated, whatever its content."
    :target `diff/diff
    :edits  [[:replace '(not= (get x id) (get y id)) true]]}
   {:name   :created-from-both
    :doc    "The created set holds every identity of the second snapshot."
    :target `diff/diff
    :edits  [[:replace '(remove (partial contains? x) (keys y)) '(keys y)]]}])

(deftest diff-mutations-test
  (mut/check mutations {:tests [#'diff-test #'diff-laws-test]}))
