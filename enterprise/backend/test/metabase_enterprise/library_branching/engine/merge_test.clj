(ns metabase-enterprise.library-branching.engine.merge-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ The per-item table -----------------------------------------------

(def ^:private i (engine.tu/eid "i"))

(def ^:private x (engine.tu/item :collection "X" nil))
(def ^:private y (engine.tu/item :collection "Y" nil))
(def ^:private z (engine.tu/item :collection "Z" nil))

(defn- snap [content] (if content {i content} {}))

(defn- merge-one
  "The merge of one item with base, ours and theirs contents `b`, `o` and `t` (nil is no content)."
  ([b o t] (merge-one b o t {}))
  ([b o t keep] (merge/merge (snap b) (snap o) (snap t) keep)))

(defn- conflict [b o t] {:conflicts [{:id i :base b :ours o :theirs t}] :violations []})

(deftest ^:parallel per-item-table-test
  (doseq [[b o t expected why]
          [[x   x   x   {:ok (snap x)}   "no change"]
           [x   y   x   {:ok (snap y)}   "ours changed"]
           [x   x   y   {:ok (snap y)}   "theirs changed"]
           [x   y   y   {:ok (snap y)}   "both made the same change"]
           [x   y   z   (conflict x y z) "both changed, differently"]
           [x   nil x   {:ok {}}         "ours deleted"]
           [x   x   nil {:ok {}}         "theirs deleted"]
           [x   nil nil {:ok {}}         "both deleted"]
           [x   nil y   (conflict x nil y) "ours deleted, theirs updated"]
           [x   y   nil (conflict x y nil) "ours updated, theirs deleted"]
           [nil y   nil {:ok (snap y)}   "ours created"]
           [nil nil y   {:ok (snap y)}   "theirs created"]
           [nil y   y   {:ok (snap y)}   "both created the same item"]
           [nil y   z   (conflict nil y z) "both created, differently"]
           [nil nil nil {:ok {}}         "no item"]]]
    (testing why
      (is (= expected (merge-one b o t))))))

(deftest ^:parallel keep-mine-test
  (testing "a keep-mine decision with the content of ours resolves the conflict to ours"
    (is (= {:ok (snap y)} (merge-one x y z {i y})))
    (is (= {:ok {}} (merge-one x nil y {i nil}))))
  (testing "a decision whose content is no longer the content of ours does not hold"
    (is (= (conflict x y z) (merge-one x y z {i x})))
    (is (= (conflict x nil y) (merge-one x nil y {i y}))))
  (testing "a decision for an item with no conflict changes nothing"
    (is (= {:ok (snap z)} (merge-one x x z {i x})))))

;;; ---------------------------------------- The Alloy merge counterexamples ----------------------------------------

(def ^:private id0 (engine.tu/eid "id0"))
(def ^:private id1 (engine.tu/eid "id1"))
(def ^:private id2 (engine.tu/eid "id2"))
(def ^:private id3 (engine.tu/eid "id3"))

(deftest ^:parallel alloy-dangling-reference-test
  (testing (str "MergeKeepsClosedRefsFails: ours removes a metric and a snippet; theirs adds a collection that refers "
                "to both. Each dangling reference is a violation that names the removed item and the new user")
    (let [b {id1 (engine.tu/item :metric "N" nil) id3 (engine.tu/item :snippet "N" nil)}
          o {}
          t (assoc b id0 (engine.tu/item :collection "N" nil #{[:card id1] [:snippet id3]}))]
      (is (= {:conflicts  []
              :violations [{:rule :refs-closed :id id0 :ref [:card id1] :ours id1 :theirs id0}
                           {:rule :refs-closed :id id0 :ref [:snippet id3] :ours id3 :theirs id0}]}
             (update (merge/merge b o t {}) :violations #(sort-by (comp str :ref) %))))))
  (testing "Q3: ours trashes a snippet, theirs adds a metric that uses it"
    (let [lib (engine.tu/eid "lib")
          b   {lib (engine.tu/item :collection "Library" nil) id3 (engine.tu/item :snippet "Filter" lib)}
          o   (dissoc b id3)
          t   (assoc b id1 (engine.tu/item :metric "Revenue" lib #{[:snippet id3]}))]
      (is (= {:conflicts  []
              :violations [{:rule :refs-closed :id id1 :ref [:snippet id3] :ours id3 :theirs id1}]}
             (merge/merge b o t {}))))))

(deftest ^:parallel alloy-orphan-test
  (testing (str "MergeKeepsPlacesFails: ours removes collection 3 and moves 1 into 0; theirs removes collection 0 "
                "and adds 2 in 3. Both 1 and 2 lose their container")
    (let [b {id0 (engine.tu/item :collection "N0" nil)
             id1 (engine.tu/item :collection "N1" id3)
             id3 (engine.tu/item :collection "N0" nil)}
          o {id0 (engine.tu/item :collection "N0" nil)
             id1 (engine.tu/item :collection "N0" id0)}
          t {id1 (engine.tu/item :collection "N1" id3)
             id2 (engine.tu/item :collection "N0" id3)
             id3 (engine.tu/item :collection "N0" nil)}]
      (is (= {:conflicts  []
              :violations [{:rule :place-inside :id id1 :place id0 :ours id1 :theirs id0}
                           {:rule :place-inside :id id2 :place id3 :ours id3 :theirs id2}]}
             (merge/merge b o t {}))))))

(deftest ^:parallel alloy-cycle-test
  (testing (str "MergeKeepsAcyclicFails: ours moves collection 0 into 3; theirs moves 3 into 0 and removes the "
                "metric 1. The cycle is a violation that names the two moves")
    (let [b {id0 (engine.tu/item :collection "N1" nil)
             id1 (engine.tu/item :metric "N0" nil)
             id3 (engine.tu/item :collection "N0" nil)}
          o (assoc b id0 (engine.tu/item :collection "N1" id3))
          t {id0 (engine.tu/item :collection "N1" nil)
             id3 (engine.tu/item :collection "N1" id0)}]
      (is (= {:conflicts  []
              :violations [{:rule :acyclic :ids #{id0 id3} :ours id0 :theirs id3}]}
             (merge/merge b o t {}))))))

(deftest ^:parallel violations-with-conflicts-test
  (testing "with a conflict, the check runs on the result in which the conflicted item keeps ours"
    (let [lib (engine.tu/eid "lib")
          b   {lib (engine.tu/item :collection "Library" nil) id3 (engine.tu/item :snippet "Filter" lib)}
          o   (-> b (dissoc id3) (assoc-in [lib :name] "Mine"))
          t   (-> b
                  (assoc-in [lib :name] "Theirs")
                  (assoc id1 (engine.tu/item :metric "Revenue" lib #{[:snippet id3]})))]
      (is (= {:conflicts  [{:id lib :base (get b lib) :ours (get o lib) :theirs (get t lib)}]
              :violations [{:rule :refs-closed :id id1 :ref [:snippet id3] :ours id3 :theirs id1}]}
             (merge/merge b o t {})))))
  (testing "an item that both sides changed is never both halves of the pair"
    (let [lib (engine.tu/eid "lib")
          b   {lib (engine.tu/item :collection "Library" nil)
               id1 (engine.tu/item :metric "Revenue" lib)
               id3 (engine.tu/item :snippet "Filter" lib)}
          o   (assoc b id1 (engine.tu/item :metric "Mine" lib #{[:snippet id3]}))
          t   (-> b (dissoc id3) (assoc-in [id1 :name] "Theirs"))]
      (is (= {:conflicts  [{:id id1 :base (get b id1) :ours (get o id1) :theirs (get t id1)}]
              :violations [{:rule :refs-closed :id id1 :ref [:snippet id3] :ours id1 :theirs id3}]}
             (merge/merge b o t {}))))))

(deftest ^:parallel roots-option-test
  (testing "`opts` go to the well-formedness check"
    (let [b {} o {id0 (engine.tu/item :collection "N" nil)} t {}]
      (is (= {:ok o} (merge/merge b o t {})))
      (is (= {:conflicts [] :violations [{:rule :root :id id0 :ours nil :theirs nil}]}
             (merge/merge b o t {} {:roots #{}}))))))

;;; ------------------------------------------ Scenarios of the remote-sync tests ------------------------------------------

(def ^:private ia (engine.tu/eid "ia"))
(def ^:private ib (engine.tu/eid "ib"))
(def ^:private ic (engine.tu/eid "ic"))
(def ^:private id (engine.tu/eid "id"))

(defn- named [kind n] (engine.tu/item kind n nil))

(deftest ^:parallel remote-sync-scenarios-test
  (let [a (named :metric "a"), b (named :metric "b")
        base {ia a ib b}]
    (testing "disjoint changes merge: a local change, a local add and a remote add; the remote add is the one change for the instance"
      (let [o (assoc base ia (assoc a :name "a2") ic (named :metric "c"))
            t (assoc base id (named :metric "d"))
            {:keys [ok]} (merge/merge base o t {})]
        (is (= (assoc o id (named :metric "d")) ok))
        (is (= {:created #{id} :deleted #{} :updated #{}} (diff/diff o ok)))))
    (testing "both sides change one item differently: a conflict, and the result takes nothing for it"
      (let [o (assoc-in base [ia :attrs :description] "mine")
            t (assoc-in base [ia :attrs :description] "theirs")]
        (is (= {:conflicts [{:id ia :base a :ours (get o ia) :theirs (get t ia)}] :violations []}
               (merge/merge base o t {})))))
    (testing "disjoint edits of two snippets (glossary terms in the old tests) merge with no conflict"
      (let [base {ia (named :snippet "term a") ib (named :snippet "term b")}
            o    (assoc-in base [ia :attrs :definition] "mine")
            t    (assoc-in base [ib :attrs :definition] "theirs")]
        (is (= {:ok (assoc o ib (get t ib))} (merge/merge base o t {})))))
    (testing "a local attribute change against a remote rename of one item is a conflict: the item is the unit"
      (let [o (assoc-in base [ia :attrs :description] "mine")
            t (assoc-in base [ia :name] "renamed")]
        (is (= [ia] (map :id (:conflicts (merge/merge base o t {})))))))
    (testing "two different renames of one item are one conflict, never two items"
      (let [r (merge/merge base (assoc-in base [ia :name] "bar") (assoc-in base [ia :name] "baz") {})]
        (is (= [ia] (map :id (:conflicts r))))
        (is (= {:ok (assoc-in base [ia :name] "bar")}
               (merge/merge base (assoc-in base [ia :name] "bar") (assoc-in base [ia :name] "baz") {ia (assoc a :name "bar")})))))
    (testing "a remote rename of an item with no local change is taken"
      (is (= {:ok (assoc-in base [ia :name] "renamed")}
             (merge/merge base base (assoc-in base [ia :name] "renamed") {}))))
    (testing "a remote delete of an item with no local change takes effect, and the plan trashes it"
      (let [{:keys [ok]} (merge/merge base base (dissoc base ia) {})]
        (is (= (dissoc base ia) ok))
        (is (= {:created #{} :deleted #{ia} :updated #{}} (diff/diff base ok)))
        (is (= [{:id ia :trash true :pre a}] (plan/plan base ok base)))))
    (testing "a local delete against a remote change is a conflict"
      (is (= [{:id ia :base a :ours nil :theirs (assoc a :name "renamed")}]
             (:conflicts (merge/merge base (dissoc base ia) (assoc-in base [ia :name] "renamed") {})))))
    (testing "a delete on both sides is clean, and the instance has no change to make"
      (let [{:keys [ok]} (merge/merge base (dissoc base ia) (dissoc base ia) {})]
        (is (= (dissoc base ia) ok))
        (is (= [] (plan/plan (dissoc base ia) ok base)))))
    (testing "a local create that the head does not hold is kept, with no conflict and no step"
      (let [o            (assoc base ic (named :snippet "never pushed"))
            t            (dissoc base ib)
            {:keys [ok]} (merge/merge base o t {})]
        (is (= (assoc t ic (get o ic)) ok))
        (is (= [{:id ib :trash true :pre b}] (plan/plan o ok base)))))))

;;; ------------------------------------------------- Properties ---------------------------------------------------

(defn- one-side-merge
  "The per-item merge of `o` and `t` from `b` when no item conflicts: each item from the side that changed it."
  [b o t]
  (into {} (keep (fn [id] (when-let [c (if (= (get o id) (get b id)) (get t id) (get o id))] [id c])))
        (set/union (set (keys b)) (set (keys o)) (set (keys t)))))

(defn- violation-names-pair?
  "True iff violation `v` names two different items, one that `o` changed and one that `t` changed against `b`."
  [b o t {:keys [ours theirs]}]
  (and (some? ours) (some? theirs) (not= ours theirs)
       (not= (get o ours) (get b ours))
       (not= (get t theirs) (get b theirs))))

(defspec merge-laws-test 300
  (prop/for-all [[b o t] (engine.tu/related-snapshots-gen)]
    (let [r (merge/merge b o t {})]
      (if-let [m (:ok r)]
        (and (lb.tu/well-formed? m)
             (= m (one-side-merge b o t)))
        (let [{:keys [conflicts violations]} r]
          (and (or (seq conflicts) (seq violations))
               (every? (fn [{:keys [id base ours theirs]}]
                         (and (= base (get b id)) (= ours (get o id)) (= theirs (get t id))
                              (not= ours base) (not= theirs base) (not= ours theirs)))
                       conflicts)
               (every? #(violation-names-pair? b o t %) violations)
               (or (seq conflicts)
                   (not (lb.tu/well-formed? (one-side-merge b o t))))))))))

(defspec one-sided-merge-is-well-formed-test 100
  (prop/for-all [[b o t] (engine.tu/related-snapshots-gen)]
    (and (= {:ok t} (merge/merge b b t {}))
         (= {:ok o} (merge/merge b o b {}))
         (= {:ok o} (merge/merge b o o {})))))

(defspec merge-symmetry-test 100
  (prop/for-all [[b o t] (engine.tu/related-snapshots-gen)]
    (let [r1 (merge/merge b o t {})
          r2 (merge/merge b t o {})]
      (and (= (:ok r1) (:ok r2))
           (= (set (map :id (:conflicts r1))) (set (map :id (:conflicts r2))))))))

(defspec keep-mine-resolves-every-conflict-test 100
  (prop/for-all [[b o t] (engine.tu/related-snapshots-gen)]
    (let [{:keys [conflicts]} (merge/merge b o t {})
          keep                (into {} (map (fn [{:keys [id ours]}] [id ours])) conflicts)
          r                   (merge/merge b o t keep)]
      (and (empty? (:conflicts r))
           (if-let [m (:ok r)]
             (every? (fn [{:keys [id ours]}] (= ours (get m id))) conflicts)
             (seq (:violations r)))))))

(def mutations
  "Each mutation removes or weakens one rule of the merge."
  [{:name   :no-check
    :doc    "The merge does not check its result for well-formedness."
    :target `merge/merge
    :edits  [[:replace '(violations b o t tentative opts) []]]}
   {:name   :theirs-wins
    :doc    "An item that both sides changed takes the content of theirs: a conflict is lost."
    :target `merge/merge-item
    :edits  [[:replace ::merge/conflict 't]]}
   {:name   :no-keep
    :doc    "A keep-mine decision is ignored."
    :target `merge/merge-item
    :edits  [[:replace '(and (contains? decisions id) (= (get decisions id) o)) false]]}
   {:name   :stale-keep
    :doc    "A keep-mine decision holds whatever the content of ours is now."
    :target `merge/merge-item
    :edits  [[:replace '(= (get decisions id) o) true]]}
   {:name   :delete-is-no-change
    :doc    "A delete on one side counts as no change, so an update on the other side wins over it."
    :target `merge/merge-item
    :edits  [[:replace '(= o b) '(or (nil? o) (= o b))]]}
   {:name   :unnamed-pair
    :doc    "A violation names the item that it is about, not the pair of changes that made it."
    :target `merge/pair
    :edits  [[:replace '(not= i j) true]]}])

(deftest merge-mutations-test
  (mut/check mutations {:tests [#'per-item-table-test #'keep-mine-test #'alloy-dangling-reference-test
                                #'alloy-orphan-test #'alloy-cycle-test #'violations-with-conflicts-test
                                #'merge-laws-test #'one-sided-merge-is-well-formed-test]}))
