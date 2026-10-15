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
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util :as u]))

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
  "True iff a chain of places and references among the items of `s` and the old items `old` leads from `from` to `to`.
  An identity with an old item stands for both of its items."
  [s old from to]
  (loop [todo [from], seen #{}]
    (if-let [[x & more] (seq todo)]
      (cond (seen x) (recur more seen)
            :else    (let [next (filter #(or (contains? s %) (contains? old %))
                                        (mapcat #(cons (:place %) (ref-targets %)) (keep #(get % x) [s old])))]
                       (if (some #{to} next) true (recur (into (vec more) next) (conj seen x)))))
      false)))

(defn- unique-key [it]
  (when-some [k (snapshot/unique-key snapshot/unique-keys it)]
    [(:kind it) k]))

(defn- key-taken?
  "True iff an item of `s` other than `id` has the unique key of `content`. An item in `later` does not count: its
  trash keeps its key, so no order of the steps frees it, and the apply refuses such a plan."
  [s later id content]
  (when-some [k (unique-key content)]
    (some (fn [[j it]] (and (not= j id) (not (later j)) (= k (unique-key it)))) s)))

(def ^:private card-kinds
  "The kinds whose items the app DB keeps in one table, the cards."
  #{:metric :model :question})

(defn- one-row?
  "True iff an item of kind `a` and an item of kind `b` with one identity are one row of the app DB."
  [a b]
  (or (= a b) (and (card-kinds a) (card-kinds b))))

(defn- put
  "`state` with `content` as the content of `id`; a fault when another item has its unique key. The item of `id` in
  another table stays, as the old item, until its trash."
  [{:keys [s later] :as state} id content]
  (let [old (get s id)]
    (cond-> (assoc-in state [:s id] content)
      (and old (not (one-row? (:kind old) (:kind content)))) (assoc-in [:old id] old)
      (key-taken? s later id content)                        (update :faults conj [:key-taken id]))))

(defn- run-step
  "Applies `step` to the simulated instance `{:s snapshot :old {id item} :content {id write} :later #{ids to trash
  later} :faults []}` as the apply does, and records each order rule that the step breaks. A write with `:defer` leaves an item that exists
  as it is, and writes a new one without the deferred references; its link writes the whole content."
  [{:keys [s old later content] :as state} {:keys [id write pre defer link interim trash]}]
  (let [fault (fn [state why] (update state :faults conj [why id]))]
    (cond
      write
      (cond-> (cond
                (empty? defer) (put state id write)
                (nil? pre)     (put state id (update write :refs set/difference (set defer)))
                :else          state)
        (not (or (nil? (:place write)) (contains? s (:place write))))
        (fault :container-after-content)

        (not (every? #(resolves? s %) (ref-targets (update write :refs set/difference (set defer)))))
        (fault :target-after-user)

        (not (set/subset? (set defer) (:refs write)))
        (fault :defer-not-a-ref))

      link
      (cond-> (put state id (get content id))
        (not (every? #(resolves? s %) (map second link)))
        (fault :link-before-target))

      interim
      (cond-> (put state id interim)
        (not= (dissoc (get s id) :name) (dissoc interim :name))
        (fault :interim-not-a-rename))

      trash
      (let [it    (get s id)
            later (disj later id)
            old'  (dissoc old id)]
        (if (and it (not (one-row? (:kind it) (:kind pre))))
          ;; the old item of another table: the item of `id` in `s` is the new one, and stays
          (cond-> (assoc state :old old' :later later)
            (not (contains? old id))
            (fault :trash-of-no-old-item)

            (or (some #(and (= id (:place %)) (not (contains? (get snapshot/may-contain (:kind it)) (:kind %)))) (vals s))
                ;; An old item came from `l`, so its place names the old item of a replaced identity.
                (some #(= id (:place %)) (vals old')))
            (fault :container-before-content))
          (let [s' (dissoc s id)]
            (cond-> (assoc state :s s' :later later)
              (some #(= id (:place %)) (concat (vals s') (vals old)))
              (fault :container-before-content)

              ;; An old item is a user of its targets until its trash.
              (some (fn [[j c]] (and (contains? (ref-targets c) id) (not (and (later j) (reaches? s old id j)))))
                    (concat s' old))
              (fault :target-before-user))))))))

(defn- simulate
  "`{:s snapshot :old {id item} :faults [...]}` after the steps of `steps`, in order, from snapshot `l`. `:old` holds
  the old items of the identities whose kind changed to another table, until their trash."
  [l steps]
  (reduce run-step
          {:s       l
           :old     {}
           :content (into {} (keep (fn [{:keys [id write]}] (when write [id write]))) steps)
           :later   (set (keep #(when (:trash %) (:id %)) steps))
           :faults  []}
          steps))

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

(def ^:private ka (engine.tu/eid "ka"))
(def ^:private kb (engine.tu/eid "kb"))
(def ^:private kc (engine.tu/eid "kc"))
(def ^:private kd (engine.tu/eid "kd"))

(defn- snippets
  "`base` with a snippet for each `[id name]` or `[id name refs]` of `specs`, in the Library."
  [& specs]
  (into base (map (fn [[id item-name refs]] [id (engine.tu/item :snippet item-name lib refs)])) specs))

(defn- step-forms
  "`[id form]` of each step: :write, :link, :interim or :trash."
  [steps]
  (map (fn [{:keys [id] :as step}] [id (some #(when (contains? step %) %) [:write :link :interim :trash])]) steps))

(defn- key-moves-apply?
  "True iff the simulated apply of `steps` from `l` reaches `m` with no fault."
  [l m steps]
  (= {:s m :faults []} (select-keys (simulate l steps) [:s :faults])))

(deftest ^:parallel key-move-test
  (testing "a rename that frees a unique key comes before the write that takes it, also when the taker is less"
    (let [l     (snippets [kb "Filter a"])
          m     (snippets [kb "Filter b"] [ka "Filter a"])
          steps (plan/plan l m l)]
      (is (= [[kb :write] [ka :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "names that differ only in case or accents are one key"
    (let [l     (snippets [kb "Héron"])
          m     (snippets [kb "Wren"] [ka "HERON"])
          steps (plan/plan l m l)]
      (is (= [[kb :write] [ka :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "a local snapshot can have two names of one key; both are free before a write takes the key"
    (let [l     (snippets [kb "Robin"] [kc "robin"])
          m     (snippets [kb "Wren"] [kc "Heron"] [ka "ROBIN"])
          steps (plan/plan l m l)]
      (is (= [[kb :write] [kc :write] [ka :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "a swap goes through a temporary name: the least item first takes it, then each item takes its new name"
    (let [l     (snippets [ka "Filter a"] [kb "Filter b"])
          m     (snippets [ka "Filter b"] [kb "Filter a"])
          steps (plan/plan l m l)]
      (is (= [[ka :interim] [kb :write] [ka :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "a rotation of three names needs one temporary name"
    (let [l     (snippets [ka "Filter a"] [kb "Filter b"] [kc "Filter c"])
          m     (snippets [ka "Filter b"] [kb "Filter c"] [kc "Filter a"])
          steps (plan/plan l m l)]
      (is (= [[ka :interim] [kc :write] [kb :write] [ka :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "a temporary name is the key of no item of either snapshot, also when an item has the name it would have"
    (let [temp-of (fn [l m] (:interim (first (plan/plan l m l))))
          keys-of (fn [& snaps] (set (keep #(snapshot/unique-key snapshot/unique-keys %) (mapcat vals snaps))))
          l       (snippets [ka "Filter a"] [kb "Filter b"])
          m       (snippets [ka "Filter b"] [kb "Filter a"])
          temp    (temp-of l m)
          l2      (snippets [ka "Filter a"] [kb "Filter b"] [kc (u/upper-case-en (:name temp))])
          m2      (snippets [ka "Filter b"] [kb "Filter a"] [kc (u/upper-case-en (:name temp))])
          temp2   (temp-of l2 m2)]
      (is (= (dissoc (get l ka) :name) (dissoc temp :name)))
      (is (not (contains? (keys-of l m) (snapshot/unique-key snapshot/unique-keys temp))))
      (is (= (dissoc (get l ka) :name) (dissoc temp2 :name)))
      (is (not (contains? (keys-of l2 m2) (snapshot/unique-key snapshot/unique-keys temp2))))
      (is (key-moves-apply? l2 m2 (plan/plan l2 m2 l2)))))
  (testing "a key move against a reference: the new holder of the name is a target of the item that frees it"
    (let [l     (snippets [kb "Filter a"])
          m     (snippets [kb "Filter b" #{[:snippet ka]}] [ka "Filter a"])
          steps (plan/plan l m l)]
      (is (= [[kb :interim] [ka :write] [kb :write]] (step-forms steps)))
      (is (key-moves-apply? l m steps))))
  (testing "an item on a reference cycle changes its name only at its link, so it frees its name by a temporary one"
    (let [l     (snippets [kc "Filter a"])
          m     (snippets [kc "Filter c" #{[:snippet kd]}] [kd "Filter d" #{[:snippet kc]}] [ka "Filter a"])
          steps (plan/plan l m l)]
      (is (= [kc :interim] (first (step-forms steps))))
      (is (key-moves-apply? l m steps))))
  (testing "a trash does not free a name: the plan writes the new holder and trashes the old one, with no interim step"
    (let [l (snippets [kb "Filter a"])
          m (snippets [ka "Filter a"])]
      (is (= [[ka :write] [kb :trash]] (step-forms (plan/plan l m l)))))))

(def ^:private robin (engine.tu/eid "robin"))

(defn- reaches-target?
  "True iff the simulated apply of `steps` from `l` reaches `m` with no fault and no old item left."
  [l m steps]
  (= {:s m :old {} :faults []} (select-keys (simulate l steps) [:s :old :faults])))

(deftest ^:parallel kind-change-test
  (testing "an identity whose kind changes to a kind of another table: a write of the new item with no content as its
           precondition, then a trash of the old item with its base content"
    ;; The shrunk case of deploy-shows-the-head-property-test: a collection, then a glossary term with its identity.
    (let [l     (assoc base robin (engine.tu/item :collection "Robin" nil))
          m     (assoc base robin (engine.tu/item :glossary-term "Robin" nil))
          steps (plan/plan l m l)]
      (is (= [{:id robin :write (get m robin) :pre nil}
              {:id robin :trash true :pre (get l robin)}]
             steps))
      (is (reaches-target? l m steps))
      (testing "and back"
        (is (= [{:id robin :write (get l robin) :pre nil}
                {:id robin :trash true :pre (get m robin)}]
               (plan/plan m l m))))))
  (testing "the content of the old item moves out before its trash, and a user of the new item comes after its write"
    (let [l     (assoc base
                       robin (engine.tu/item :collection "Robin" lib)
                       m2    (engine.tu/item :metric "Count" robin))
          m     (assoc base
                       robin (engine.tu/item :snippet "Robin" lib)
                       m2    (engine.tu/item :metric "Count" lib #{[:snippet robin]}))
          steps (plan/plan l m l)]
      (is (= [[robin :write] [m2 :write] [robin :trash]] (step-forms steps)))
      (is (= nil (:pre (first steps))))
      (is (reaches-target? l m steps))))
  (testing "a kind change inside one table (a card that changes its type) is one write with the base content as its
           precondition"
    (doseq [[from to] [[:question :model] [:model :question] [:question :metric] [:metric :model]]]
      (testing [from to]
        (let [l (assoc base robin (engine.tu/item from "Robin" lib))
              m (assoc base robin (engine.tu/item to "Robin" lib))]
          (is (= [{:id robin :write (get m robin) :pre (get l robin)}] (plan/plan l m l)))))))
  (testing "a system item whose kind changes to another table is refused, as its removal is"
    (let [m (assoc with-system metrics-id (engine.tu/item :glossary-term "Metrics" nil))]
      (is (= {:system-ids [metrics-id]}
             (try (plan/plan with-system m with-system) (catch clojure.lang.ExceptionInfo e (ex-data e))))))))

(deftest ^:parallel kind-change-cycle-test
  (testing "a container that changes kind, in a cycle of places and references with the content that leaves it"
    ;; From a shrunk counterexample of plan-laws-test: collection a refers to dashboard d, d is in a and refers to
    ;; collection b, b is in a, and e is in b. The target has a as a dashboard at the root level. Until its trash, the
    ;; old collection a closes the cycle b, a, d, so the trash of b can come before the trash of its user d.
    (let [a     (engine.tu/eid "a")
          b     (engine.tu/eid "b")
          d     (engine.tu/eid "d")
          e     (engine.tu/eid "e")
          l     {a (engine.tu/item :collection "A" nil #{[:card d]})
                 b (engine.tu/item :collection "B" a)
                 d (engine.tu/item :dashboard "D" a #{[:card b]})
                 e (engine.tu/item :collection "E" b)}
          m     {a (engine.tu/item :dashboard "A" nil)}
          steps (plan/plan l m l)]
      (is (= [[a :write] [e :trash] [b :trash] [d :trash] [a :trash]] (step-forms steps)))
      (is (reaches-target? l m steps))))
  (testing "the old item of a replaced identity is a user of its targets until its trash"
    (let [x     (engine.tu/eid "x")
          y     (engine.tu/eid "y")
          l     {x (engine.tu/item :collection "X" nil #{[:card y]})
                 y (engine.tu/item :collection "Y" nil)}
          m     {x (engine.tu/item :dashboard "X" nil)}
          steps (plan/plan l m l)
          [write-x trash-x trash-y] steps]
      (is (= [[x :write] [x :trash] [y :trash]] (step-forms steps)))
      (is (reaches-target? l m steps))
      (is (= [[:target-before-user y]] (:faults (simulate l [write-x trash-y trash-x])))))))

;;; ---------------------------------------------------- Properties ----------------------------------------------

(defn- merged
  "The merge of `[b l r]`, with keep-mine for every conflict; nil when it has a violation."
  [[b l r]]
  (let [keep (into {} (map (juxt :id :ours)) (:conflicts (merge/merge b l r {})))]
    (:ok (merge/merge b l r keep))))

(defn- other-table
  "The identities of items of both `l` and `m` whose kinds there are kinds of two tables."
  [l m]
  (set (filter (fn [id] (and (contains? m id) (not (one-row? (:kind (get l id)) (:kind (get m id)))))) (keys l))))

(defn- plan-laws?
  "True iff the plan of the merge of `[b l r]` writes each changed item of the merge result once and trashes each
  changed item of `l` that the result lacks, or has with a kind of another table, once; each step with the base content
  as its precondition, except the write of an item of another table, which has none; and the simulated apply reaches
  the merge result with no fault. Or the merge has a violation."
  [[b l :as snaps]]
  (if-let [m (merged snaps)]
    (let [steps   (plan/plan l m b)
          changed (engine.tu/changed l m)
          moved   (other-table l m)
          writes  (filter :write steps)
          trashes (filter :trash steps)]
      (and (= (set (map :id writes)) (set (filter #(contains? m %) changed)))
           (= (set (map :id trashes)) (into moved (remove #(contains? m %)) changed))
           (apply distinct? nil (map :id writes))
           (apply distinct? nil (map :id trashes))
           (every? (fn [{:keys [id pre]}]
                     (if (moved id) (nil? pre) (and (= pre (get b id)) (= pre (get l id)))))
                   writes)
           (every? (fn [{:keys [id pre]}] (and (= pre (get b id)) (= pre (get l id)))) trashes)
           (= {:s m :old {} :faults []} (select-keys (simulate l steps) [:s :old :faults]))))
    true))

(defspec plan-laws-test 300
  (prop/for-all [snaps (engine.tu/related-snapshots-gen)]
    (plan-laws? snaps)))

(defspec plan-laws-ref-cycle-test 100
  ;; The random edits of plan-laws-test give a trash of a reference cycle of three or more items rarely, so this
  ;; property builds a cycle in each case.
  (prop/for-all [snaps (engine.tu/ref-cycle-snapshots-gen)]
    (plan-laws? snaps)))

(defspec plan-laws-key-move-test 300
  ;; The random renames of plan-laws-test rarely move a name from one item to another, so this property builds the
  ;; moves: renames, swaps, rotations, new holders of a freed name, and references among the items.
  (prop/for-all [snaps (engine.tu/key-move-snapshots-gen)]
    (plan-laws? snaps)))

(defspec plan-laws-kind-change-test 300
  ;; The random edits of plan-laws-test give a container another kind, after its content left it, rarely, so this
  ;; property builds such a change in each case, with references between the container and its content.
  (prop/for-all [snaps (engine.tu/kind-change-snapshots-gen)]
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
    :edits  [[:replace '(ordered ids (add-edges after (remove (comp interim first) moves)))
              '(map vector (sort snapshot/compare-identities ids))]]}
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
    :edits  [[:replace '(concat interims writes links trashes) '(concat trashes interims writes links)]]}
   {:name   :keys-unordered
    :doc    "Key moves do not order the writes, so a write can take a key that another item still has."
    :target `plan/write-steps
    :edits  [[:replace '(add-edges after (remove (comp interim first) moves)) 'after]]}
   {:name   :no-interim
    :doc    "No item takes a temporary key, so a swap of two keys is a cycle that no order of the writes allows."
    :target `plan/write-steps
    :edits  [[:replace '(interim-ids ids after moves late?) #{}]]}
   {:name   :late-freer-ordered
    :doc    "An item whose write leaves it as it is frees its key by the order of the writes; it frees it at its link."
    :target `plan/interim-ids
    :edits  [[:replace '(comp late? first) '(constantly false)]]}
   {:name   :temporary-key-taken
    :doc    "A temporary key can be the key of another item."
    :target `plan/temporary-keys
    :edits  [[:replace '(remove (comp taken snapshot/fold-name) candidates) 'candidates]]}
   {:name   :no-defer
    :doc    "A reference cycle is written in one step per item, so a write refers to an item that does not exist yet."
    :target `plan/write-steps
    :edits  [[:replace '(cyclic-refs m ids stub-kinds) '(constantly #{})]]}
   {:name   :pre-is-local
    :doc    "A step has no precondition."
    :target `plan/write-step
    :edits  [[:replace '(get b id) nil]]}
   {:name   :unknown-planned
    :doc    "An unknown base counts as equal to the local content, so a plan writes over a trash before the first sync."
    :target `plan/check-base-equal!
    :edits  [[:replace '(not= (get l id) (get b id)) '(and (not= :unknown (get b id)) (not= (get l id) (get b id)))]]}
   {:name   :kind-change-in-place
    :doc    "A kind change to another table is a write of the item in place, with the old item as its precondition: the
            apply reads the new kind, finds no item, and the precondition fails on each attempt."
    :target `plan/plan
    :edits  [[:replace '(kind-changes l m changed) ()]]}
   {:name   :replaced-trash-by-new-content
    :doc    "The trash order reads the target content of a replaced item, so the references of its old item do not put
            its trash before the trash of their targets."
    :target `plan/plan
    :edits  [[:replace '(trash-steps l b removed) '(trash-steps (merge l m) b removed)]]}
   {:name   :system-trash
    :doc    "A plan trashes a system item that the target lacks."
    :target `plan/plan
    :edits  [[:remove '(check-system-kept! system removed)]]}])

(deftest plan-mutations-test
  (mut/check mutations {:tests [#'plan-steps-test #'plan-order-test #'reference-cycle-test #'trash-cycle-test
                                #'local-change-test #'unknown-base-test #'system-item-test #'key-move-test
                                #'kind-change-test #'kind-change-cycle-test
                                #'plan-laws-test #'plan-laws-ref-cycle-test #'plan-laws-key-move-test
                                #'plan-laws-kind-change-test
                                #'plan-unknown-base-test]}))
