(ns metabase-enterprise.library-branching.engine.merge-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
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

(deftest ^:parallel kind-change-test
  (let [term  (engine.tu/item :glossary-term "X" nil)
        x2    (assoc x :name "X 2")
        term2 (assoc term :name "X 2")]
    (testing "a kind change is a change of the item: the diff gives an update, and the merge takes it from the side
             that made it"
      (is (= {:created #{} :deleted #{} :updated #{i}} (diff/diff (snap x) (snap term))))
      (is (= {:ok (snap term)} (merge-one x term x)))
      (is (= {:ok (snap term)} (merge-one x x term)))
      (is (= {:ok (snap term)} (merge-one x term term))))
    (testing "a kind change on one side and an edit or another kind change on the other is a conflict of the item"
      (is (= (conflict x term x2) (merge-one x term x2)))
      (is (= (conflict x x2 term) (merge-one x x2 term)))
      (is (= (conflict x term term2) (merge-one x term term2)))
      (is (= (conflict x term nil) (merge-one x term nil))))))

(deftest ^:parallel unknown-base-test
  (testing "a base value :unknown equals no content: each difference of the two sides is a conflict"
    (doseq [[o t expected why]
            [[x   x   {:ok (snap x)}          "equal on both sides"]
             [nil nil {:ok {}}                "absent on both sides"]
             [x   y   (conflict :unknown x y)   "two contents"]
             [nil x   (conflict :unknown nil x) "ours has no item, theirs has one"]
             [x   nil (conflict :unknown x nil) "ours has an item, theirs has none"]]]
      (testing why
        (is (= expected (merge-one :unknown o t))))))
  (testing "a keep-mine decision resolves a conflict with an unknown base"
    (is (= {:ok {}} (merge-one :unknown nil x {i nil})))
    (is (= {:ok (snap y)} (merge-one :unknown y x {i y}))))
  (testing "TLC run v4a: a trash before the first sync is not undone"
    ;; The instance held the item with the remote's identity, and a person trashed it. With no base content, the
    ;; first pull takes the remote content, and the item comes back. With an unknown base, it is a conflict.
    (is (= {:ok (snap x)} (merge-one nil nil x)))
    (is (= (conflict :unknown nil x) (merge-one :unknown nil x)))))

(deftest ^:parallel side-change-test
  (testing "the change of one side of a conflict against a known base"
    (doseq [[b side expected] [[nil x :created] [x y :updated] [x nil :deleted] [x x :unchanged] [nil nil :unchanged]]]
      (testing (pr-str [b side])
        (is (= expected (merge/side-change b side))))))
  (testing "with a base that equals no content, only whether the side has content"
    (doseq [[b side expected] [[:unknown x :present] [:unknown nil :absent] [::lost x :present] [::lost nil :absent]]]
      (testing (pr-str [b side])
        (is (= expected (merge/side-change b side)))))))

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

(deftest ^:parallel alloy-unique-keys-test
  (let [lib (engine.tu/eid "lib")
        b   {lib (engine.tu/item :collection "Library" nil) id1 (engine.tu/item :snippet "M" lib)}]
    (testing (str "MergeKeepsUniqueKeysFails: ours renames snippet 1 to N; theirs creates snippet 2 named N. Each "
                  "side has unique names; the result has two snippets named N, a violation that names the pair")
      (let [o (assoc-in b [id1 :name] "N")
            t (assoc b id2 (engine.tu/item :snippet "N" lib))]
        (is (= {:conflicts  []
                :violations [{:rule :unique-key :kind :snippet :key "N" :ids #{id1 id2} :ours id1 :theirs id2}]}
               (merge/merge b o t {})))))
    (testing "both sides create a snippet named N, each in another collection: the pair is the two new snippets"
      (let [b (assoc b id0 (engine.tu/item :collection "Other" lib))
            o (assoc b id2 (engine.tu/item :snippet "N" lib))
            t (assoc b id3 (engine.tu/item :snippet "N" id0))]
        (is (= {:conflicts  []
                :violations [{:rule :unique-key :kind :snippet :key "N" :ids #{id2 id3} :ours id2 :theirs id3}]}
               (merge/merge b o t {})))))
    (testing "ours renames snippet 1 to N; theirs creates snippet 2 named ň: the names are one key"
      (let [o (assoc-in b [id1 :name] "N")
            t (assoc b id2 (engine.tu/item :snippet "ň" lib))]
        (is (= {:conflicts  []
                :violations [{:rule :unique-key :kind :snippet :key "N" :ids #{id1 id2} :ours id1 :theirs id2}]}
               (merge/merge b o t {})))))
    (testing "both sides make one snippet with one name: no clash"
      (let [o (assoc b id2 (engine.tu/item :snippet "N" lib))]
        (is (= {:ok o} (merge/merge b o o {})))))
    (testing "ours renames snippet 1 away from N, theirs creates snippet 2 named N: no clash"
      (let [b (assoc-in b [id1 :name] "N")
            o (assoc-in b [id1 :name] "M")
            t (assoc b id2 (engine.tu/item :snippet "N" lib))]
        (is (= {:ok (assoc o id2 (get t id2))} (merge/merge b o t {})))))))

(deftest ^:parallel nested-identities-test
  (testing "each side adds a timeline that holds one event: the result has two holders, a violation that names the pair"
    (let [lib    (engine.tu/eid "lib")
          event  {:id (engine.tu/eid "event") :name "Launch"}
          tl     (fn [nm] (assoc-in (engine.tu/item :timeline nm lib) [:attrs :events] [event]))
          b      {lib (engine.tu/item :collection "Library" nil)}
          o      (assoc b id1 (tl "Ours"))
          t      (assoc b id2 (tl "Theirs"))]
      (is (= {:conflicts  []
              :violations [{:rule :nested-identity :kind :timeline :key (:id event) :ids #{id1 id2}
                            :ours id1 :theirs id2}]}
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

(defspec conflict-sides-test 300
  ;; Both sides of a conflict changed the item against a known base, and a side with no content deleted it; with an
  ;; unknown base, a side has content or has none.
  (prop/for-all [[b o t] (gen/one-of [(engine.tu/related-snapshots-gen) (engine.tu/unknown-base-snapshots-gen)])]
    (every? (fn [{:keys [base ours theirs]}]
              (every? (fn [side]
                        (let [change (merge/side-change base side)]
                          (if (= :unknown base)
                            (= change (if (some? side) :present :absent))
                            (and (not= :unchanged change)
                                 (= (= :deleted change) (nil? side))
                                 (= (= :created change) (nil? base))))))
                      [ours theirs]))
            (:conflicts (merge/merge b o t {})))))

(defspec merge-keeps-unique-keys-fails-test 200
  ;; Alloy MergeKeepsUniqueKeysFails: each side has unique keys, and the per-item merge gives two snippets one name.
  ;; The merge check reports the clash with its pair.
  (prop/for-all [[b o t ours theirs] (engine.tu/key-clash-snapshots-gen)]
    (and (lb.tu/unique-keys? o)
         (lb.tu/unique-keys? t)
         (some #(= {:rule :unique-key :ids #{ours theirs} :ours ours :theirs theirs}
                   (select-keys % [:rule :ids :ours :theirs]))
               (:violations (merge/merge b o t {}))))))

(defspec violation-names-two-items-with-keys-test 300
  ;; Alloy ViolationNamesTwoItemsWithKeys: a key clash of a merge names two items with the key, one changed on each
  ;; side.
  (prop/for-all [[b o t] (gen/one-of [(engine.tu/related-snapshots-gen)
                                      (gen/fmap #(subvec % 0 3) (engine.tu/key-clash-snapshots-gen))])]
    (every? (fn [{:keys [ids key] :as v}]
              (and (violation-names-pair? b o t v)
                   (contains? ids (:ours v))
                   (contains? ids (:theirs v))
                   (= (snapshot/fold-name key)
                      (snapshot/fold-name (:name (get o (:ours v))))
                      (snapshot/fold-name (:name (get t (:theirs v)))))))
            (filter #(= :unique-key (:rule %)) (:violations (merge/merge b o t {}))))))

(defspec unknown-base-merge-test 300
  ;; An item with an unknown base is equal on both sides, or a conflict.
  (prop/for-all [[b o t] (engine.tu/unknown-base-snapshots-gen)]
    (let [r         (merge/merge b o t {})
          conflicts (set (map :id (:conflicts r)))]
      (every? (fn [id]
                (if (= (get o id) (get t id))
                  (and (not (conflicts id)) (if-let [m (:ok r)] (= (get o id) (get m id)) true))
                  (contains? conflicts id)))
              (keep (fn [[id v]] (when (= :unknown v) id)) b)))))

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
    :edits  [[:replace '(not= i j) true]]}
   {:name   :side-change-ignores-the-base
    :doc    "The change of a side does not compare with the base: every side with content is an update."
    :target `merge/side-change
    :edits  [[:replace '(nil? b) false]]
    :tests  [#'side-change-test #'conflict-sides-test]}
   {:name   :side-change-of-an-unknown-base
    :doc    "An unknown base is taken as a base with no content, so a side with content is a create."
    :target `merge/side-change
    :edits  [[:replace '(keyword? b) false]]
    :tests  [#'side-change-test #'conflict-sides-test]}
   {:name   :unknown-is-none
    :doc    "An unknown base is no content, so a remote item comes back over a trash before the first sync."
    :target `merge/merge
    :edits  [[:replace '(get b id) '(let [v (get b id)] (when-not (= :unknown v) v)) {:nth 0}]]}])

(deftest merge-mutations-test
  (mut/check mutations {:tests [#'per-item-table-test #'unknown-base-test #'keep-mine-test
                                #'alloy-dangling-reference-test #'alloy-orphan-test #'alloy-cycle-test
                                #'alloy-unique-keys-test #'violations-with-conflicts-test
                                #'merge-laws-test #'merge-keeps-unique-keys-fails-test
                                #'violation-names-two-items-with-keys-test
                                #'unknown-base-merge-test #'one-sided-merge-is-well-formed-test]}))
