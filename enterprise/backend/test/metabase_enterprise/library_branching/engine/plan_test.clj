(ns metabase-enterprise.library-branching.engine.plan-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

(def ^:private lib (engine.tu/eid "lib"))
(def ^:private sub (engine.tu/eid "sub"))
(def ^:private m1 (engine.tu/eid "m1"))
(def ^:private m2 (engine.tu/eid "m2"))
(def ^:private sn (engine.tu/eid "sn"))

(def ^:private base
  {lib (engine.tu/item :collection "Library" nil)
   m1  (engine.tu/item :metric "Revenue" lib)
   sn  (engine.tu/item :snippet "Filter" lib)})

;;; ------------------------------------------- A simulator of the apply ------------------------------------------

(defn- ref-targets [content] (set (map second (:refs content))))

(defn- resolves? [s target] (or (lb.tu/env-target? target) (contains? s target)))

(defn- reaches?
  "True iff a chain of places and references among the items of `s` leads from `from` to `to`."
  [s from to]
  (loop [todo [from], seen #{}]
    (if-let [[x & more] (seq todo)]
      (cond (seen x) (recur more seen)
            :else    (let [next (filter #(contains? s %) (cons (:place (get s x)) (ref-targets (get s x))))]
                       (if (some #{to} next) true (recur (into (vec more) next) (conj seen x)))))
      false)))

(defn- run-step
  "Applies `step` to the simulated instance `{:s snapshot :later #{ids to trash later} :faults []}`, and records each
  order rule that the step breaks."
  [{:keys [s later] :as state} {:keys [id write defer link trash]}]
  (let [fault (fn [state why] (update state :faults conj [why id]))]
    (cond
      write
      (cond-> (assoc-in state [:s id] write)
        (not (or (nil? (:place write)) (contains? s (:place write))))
        (fault :container-after-content)

        (not (every? #(resolves? s %) (ref-targets (update write :refs set/difference (set defer)))))
        (fault :target-after-user)

        (not (set/subset? (set defer) (:refs write)))
        (fault :defer-not-a-ref))

      link
      (cond-> state
        (not (every? #(resolves? s %) (map second link)))
        (fault :link-before-target))

      trash
      (let [s'    (dissoc s id)
            later (disj later id)]
        (cond-> (assoc state :s s' :later later)
          (some #(= id (:place %)) (vals s'))
          (fault :container-before-content)

          (some (fn [[j c]] (and (contains? (ref-targets c) id) (not (and (later j) (reaches? s id j))))) s')
          (fault :target-before-user))))))

(defn- simulate
  "`{:s snapshot :faults [...]}` after the steps of `steps`, in order, from snapshot `l`."
  [l steps]
  (reduce run-step {:s l :later (set (keep #(when (:trash %) (:id %)) steps)) :faults []} steps))

;;; --------------------------------------------------- Fixed cases ------------------------------------------------

(deftest ^:parallel plan-steps-test
  (testing "no difference gives no step"
    (is (= [] (plan/plan base base base))))
  (testing "a remote change of a base-equal item is a write with the base content as its precondition"
    (let [m (assoc-in base [m1 :name] "Revenue 2")]
      (is (= [{:id m1 :write (get m m1) :pre (get base m1)}] (plan/plan base m base)))))
  (testing "a created item has no content as its precondition"
    (let [m (assoc base m2 (engine.tu/item :metric "Count" lib))]
      (is (= [{:id m2 :write (get m m2) :pre nil}] (plan/plan base m base)))))
  (testing "a removed item is a trash step"
    (is (= [{:id sn :trash true :pre (get base sn)}] (plan/plan base (dissoc base sn) base)))))

(deftest ^:parallel plan-order-test
  (testing "a new container is written before its content, and a target before its user"
    (let [m (assoc base
                   m2  (engine.tu/item :metric "Count" sub #{[:snippet sn] [:card m1]})
                   sub (engine.tu/item :collection "Sub" lib)
                   sn  (engine.tu/item :snippet "Filter 2" lib)
                   m1  (engine.tu/item :metric "Revenue" lib #{[:snippet sn]}))
          steps (plan/plan base m base)]
      (is (= [] (:faults (simulate base steps))))
      (is (= m (:s (simulate base steps))))
      (is (< (.indexOf ^java.util.List (mapv :id steps) sn) (.indexOf ^java.util.List (mapv :id steps) m1)))))
  (testing "content is trashed before its container, and a user before its target"
    (let [l     (assoc base
                       sub (engine.tu/item :collection "Sub" lib)
                       m2  (engine.tu/item :metric "Count" sub #{[:card m1]}))
          m     (dissoc l sub m2 m1)
          steps (plan/plan l m l)]
      (is (= [m2 m1 sub] (map :id steps)))
      (is (every? :trash steps))
      (is (= [] (:faults (simulate l steps))))))
  (testing "writes come before trashes: an item moves out of a container before the container is trashed"
    (let [l     (assoc base sub (engine.tu/item :collection "Sub" lib) m2 (engine.tu/item :metric "Count" sub))
          m     (-> l (dissoc sub) (assoc-in [m2 :place] lib))
          steps (plan/plan l m l)]
      (is (= [m2 sub] (map :id steps)))
      (is (= [] (:faults (simulate l steps)))))))

(deftest ^:parallel reference-cycle-test
  (testing "two new items that refer to each other are written in two steps each: the items, then the references"
    (let [m     (assoc base
                       m2 (engine.tu/item :metric "Count" lib #{[:card sn]})
                       sn (engine.tu/item :snippet "Filter" lib #{[:card m2]}))
          steps (plan/plan base m base)]
      (is (= [{:id m2 :write (get m m2) :pre nil :defer #{[:card sn]}}
              {:id sn :write (get m sn) :pre (get base sn) :defer #{[:card m2]}}
              {:id m2 :link #{[:card sn]}}
              {:id sn :link #{[:card m2]}}]
             steps))
      (is (= [] (:faults (simulate base steps))))))
  (testing "an item that refers to itself is a cycle of one"
    (let [m (assoc base m2 (engine.tu/item :metric "Count" lib #{[:card m2] [:card m1]}))]
      (is (= [{:id m2 :write (get m m2) :pre nil :defer #{[:card m2]}}
              {:id m2 :link #{[:card m2]}}]
             (plan/plan base m base)))))
  (testing "a reference to an item outside the cycle is not deferred"
    (let [m     (assoc base
                       m2 (engine.tu/item :metric "Count" lib #{[:card sub] [:card m1]})
                       sub (engine.tu/item :collection "Sub" lib #{[:card m2]}))
          steps (plan/plan base m base)]
      (is (= #{[:card sub]} (:defer (first (filter #(= m2 (:id %)) steps)))))
      (is (= [] (:faults (simulate base steps)))))))

(deftest ^:parallel trash-cycle-test
  (testing "in a cycle of a place and references, an item is still trashed before its container"
    ;; From a shrunk counterexample of plan-laws-test: collection e refers to table t, t refers to metric g, and g
    ;; is in e.
    (let [e     (engine.tu/eid "e")
          g     (engine.tu/eid "g")
          t     ["Sample Database" nil "ORDERS"]
          l     (assoc base
                       e (engine.tu/item :collection "E" nil #{[:card t]})
                       t (engine.tu/item :published-table "Orders" nil #{[:card g]})
                       g (engine.tu/item :metric "G" e))
          steps (plan/plan l base l)]
      (is (= [g e t] (map :id steps)))
      (is (= [] (:faults (simulate l steps))))))
  (testing "after the first trash of a reference cycle, the rest of the cycle is trashed users first"
    ;; From a shrunk counterexample of plan-laws-test: table t refers to collection e, e refers to collection d, and d
    ;; refers to t. After the trash of d, t still refers to e, so t goes to the trash before e.
    (let [d     (engine.tu/eid "d")
          e     (engine.tu/eid "e")
          t     ["Sample Database" nil "ORDERS"]
          l     (assoc base
                       t (engine.tu/item :published-table "Orders" nil #{[:card e]})
                       d (engine.tu/item :collection "D" nil #{[:card t]})
                       e (engine.tu/item :collection "E" nil #{[:card d]}))
          steps (plan/plan l base l)]
      (is (= [d t e] (map :id steps)))
      (is (= [] (:faults (simulate l steps)))))))

(deftest ^:parallel local-change-test
  (testing "TLA+ ABA trace: an item with a local change is never in a plan"
    ;; Base x. Remote r. Local a: a conflict. The person takes theirs, which is a save of r on the instance; then
    ;; saves b and a again. The merge keeps the local content, so the plan has no step for the item, and a pull
    ;; never writes over the save.
    (let [x       (get base m1)
          r       (assoc x :name "Remote")
          a       (assoc x :name "Local")
          remote  (assoc base m1 r sn (assoc (get base sn) :name "Remote filter"))
          local-1 (assoc base m1 a)]
      (is (= [m1] (map :id (:conflicts (merge/merge base local-1 remote {})))))
      (testing "after take-theirs, the local content equals the remote content: no step"
        (let [local-2 (assoc base m1 r)
              {:keys [ok]} (merge/merge base local-2 remote {})]
          (is (= [sn] (map :id (plan/plan local-2 ok base))))))
      (testing "after later saves, the item has a local change again: the merge keeps it with a decision, no step"
        (let [local-3 (assoc base m1 (assoc x :name "Saved again"))
              {:keys [ok]} (merge/merge base local-3 remote {m1 (get local-3 m1)})]
          (is (= (get local-3 m1) (get ok m1)))
          (is (= [sn] (map :id (plan/plan local-3 ok base))))))))
  (testing "a target snapshot that changes an item with a local change is refused"
    (let [local (assoc-in base [m1 :name] "Local")
          m     (assoc-in base [m1 :name] "Remote")]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"local change"
                            (plan/plan local m base)))
      (is (= {:ids [m1]}
             (try (plan/plan local m base) (catch clojure.lang.ExceptionInfo e (ex-data e))))))))

(deftest ^:parallel unknown-base-test
  (testing "an item with an unknown base that the target changes counts as a local change: the plan refuses it"
    (let [b (assoc base m2 :unknown)
          m (assoc base m2 (engine.tu/item :metric "Count" lib))]
      (is (= {:ids [m2]} (try (plan/plan base m b) (catch clojure.lang.ExceptionInfo e (ex-data e)))))
      (is (= {:ids [sn]} (try (plan/plan base (dissoc base sn) (assoc base sn :unknown))
                              (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
  (testing "an item with an unknown base that is equal on both sides has no step"
    (let [l (assoc base m2 (engine.tu/item :metric "Count" lib))]
      (is (= [] (plan/plan base base (assoc base m2 :unknown))))
      (is (= [] (plan/plan l l (assoc l m2 :unknown))))))
  (testing "first pull: ours trashed an item, theirs has it; keep mine gives a target with no step for it"
    (let [b {m2 :unknown}
          o base
          t (assoc base m2 (engine.tu/item :metric "Count" lib))
          {:keys [ok]} (merge/merge b o t {m2 nil})]
      (is (= [] (plan/plan o ok b))))))

(def ^:private library-id "librarylibrarylibrary")
(def ^:private metrics-id "librarylibrarymetrics")

(def ^:private with-system
  (assoc base
         library-id (engine.tu/item :collection "Library" nil)
         metrics-id (engine.tu/item :collection "Metrics" library-id)))

(deftest ^:parallel system-item-test
  (testing "a target that removes a system item is refused, with the system items it removes"
    (is (= {:system-ids [library-id metrics-id]}
           (try (plan/plan with-system base with-system) (catch clojure.lang.ExceptionInfo e (ex-data e)))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"system items"
                          (plan/plan with-system (dissoc with-system metrics-id) with-system))))
  (testing "a write of a system item is a step"
    (let [m (assoc-in with-system [metrics-id :attrs :description] "All metrics")]
      (is (= [{:id metrics-id :write (get m metrics-id) :pre (get with-system metrics-id)}]
             (plan/plan with-system m with-system)))))
  (testing "`:system` replaces the set of system items"
    (is (= [{:id metrics-id :trash true :pre (get with-system metrics-id)}]
           (plan/plan with-system (dissoc with-system metrics-id) with-system {:system #{}})))
    (is (= {:system-ids [sn]}
           (try (plan/plan base (dissoc base sn) base {:system #{sn}})
                (catch clojure.lang.ExceptionInfo e (ex-data e)))))))

;;; ---------------------------------------------------- Properties ----------------------------------------------

(defn- merged
  "The merge of `[b l r]`, with keep-mine for every conflict; nil when it has a violation."
  [[b l r]]
  (let [keep (into {} (map (juxt :id :ours)) (:conflicts (merge/merge b l r {})))]
    (:ok (merge/merge b l r keep))))

(defn- plan-laws?
  "True iff the plan of the merge of `[b l r]` writes each changed item once, with the base content as its
  precondition, and the simulated apply reaches the merge result with no fault; or the merge has a violation."
  [[b l :as snaps]]
  (if-let [m (merged snaps)]
    (let [steps   (plan/plan l m b)
          written (set (map :id (remove :link steps)))]
      (and (= written (engine.tu/changed l m))
           (every? (fn [{:keys [id pre link]}] (or link (and (= pre (get b id)) (= pre (get l id))))) steps)
           (= (count written) (count (remove :link steps)))
           (let [{:keys [s faults]} (simulate l steps)]
             (and (= [] faults) (= m s)))))
    true))

(defspec plan-laws-test 300
  (prop/for-all [snaps (engine.tu/related-snapshots-gen)]
    (plan-laws? snaps)))

(defspec plan-laws-ref-cycle-test 100
  ;; The random edits of plan-laws-test give a trash of a reference cycle of three or more items rarely, so this
  ;; property builds a cycle in each case.
  (prop/for-all [snaps (engine.tu/ref-cycle-snapshots-gen)]
    (plan-laws? snaps)))

(defspec plan-never-writes-a-local-change-test 300
  (prop/for-all [[b l :as snaps] (engine.tu/related-snapshots-gen)]
    (if-let [m (merged snaps)]
      (empty? (set/intersection (engine.tu/changed b l) (set (map :id (plan/plan l m b)))))
      true)))

(defspec plan-unknown-base-test 300
  ;; With unknown base values and keep-mine for every conflict, the plan of a merge never has a step for an item with
  ;; an unknown base.
  (prop/for-all [[b l :as snaps] (engine.tu/unknown-base-snapshots-gen)]
    (if-let [m (merged snaps)]
      (not-any? #(= :unknown (get b (:id %))) (plan/plan l m b))
      true)))

(def mutations
  "Each mutation removes or weakens one rule of the plan."
  [{:name   :aba
    :doc    "The plan writes items with a local change (the TLA+ ABA trace of the first design)."
    :target `plan/plan
    :edits  [[:remove '(check-base-equal! l b changed)]]}
   {:name   :unordered-writes
    :doc    "Writes are in the order of their identities, so content can come before its container or target."
    :target `plan/write-steps
    :edits  [[:replace '(ordered ids after) '(map vector (sort snapshot/compare-identities ids))]]}
   {:name   :unordered-trashes
    :doc    "Trashes are in the order of their identities, so a container can go before its content."
    :target `plan/trash-steps
    :edits  [[:replace '(ordered group (dependencies l group)) '(map vector (sort snapshot/compare-identities group))]]}
   {:name   :trash-cycle-unordered
    :doc    "A cycle starts with its least item, so a container can go to the trash before its content."
    :target `plan/cycle-start
    :edits  [[:replace '(first (remove places ids)) '(first ids)]]}
   {:name   :cycle-rest-unordered
    :doc    "After the first trash of a cycle, the rest is in the order of the identities: a user after its target."
    :target `plan/split-cycle
    :edits  [[:replace '[[start] (vec (remove #{start} ids))] '(mapv vector (cons start (remove #{start} ids)))]]}
   {:name   :trash-first
    :doc    "Trashes come before writes, so a container can be trashed with content that the plan moves out of it."
    :target `plan/plan
    :edits  [[:replace '(concat writes links trashes) '(concat trashes writes links)]]}
   {:name   :no-defer
    :doc    "A reference cycle is written in one step per item, so a write refers to an item that does not exist yet."
    :target `plan/write-steps
    :edits  [[:replace '(cyclic-refs m ids) '(constantly #{})]]}
   {:name   :pre-is-local
    :doc    "A step has no precondition."
    :target `plan/write-step
    :edits  [[:replace '(get b id) nil]]}
   {:name   :unknown-planned
    :doc    "An unknown base counts as equal to the local content, so a plan writes over a trash before the first sync."
    :target `plan/check-base-equal!
    :edits  [[:replace '(not= (get l id) (get b id)) '(and (not= :unknown (get b id)) (not= (get l id) (get b id)))]]}
   {:name   :system-trash
    :doc    "A plan trashes a system item that the target lacks."
    :target `plan/plan
    :edits  [[:remove '(check-system-kept! system removed)]]}])

(deftest plan-mutations-test
  (mut/check mutations {:tests [#'plan-steps-test #'plan-order-test #'reference-cycle-test #'trash-cycle-test
                                #'local-change-test #'unknown-base-test #'system-item-test
                                #'plan-laws-test #'plan-laws-ref-cycle-test #'plan-unknown-base-test]}))
