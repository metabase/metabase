(ns metabase-enterprise.library-branching.apply-test
  "The rules of the apply over the item operations of an instance in memory: the precondition of each step against the
  state that `current` gives, with and without a base; the unique keys of the written items against the rows that
  stay (the trash included); and no trash of a system item. Each apply that does not return `:ok` writes nothing."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- apply-to!
  "`[result state]`: the result of `apply/apply-plan` of `plan` on the memory instance state `state`, with the base
  `base`, and the state after it. A result other than `:ok` leaves the state as it was."
  [state plan base]
  (let [st     (volatile! (assoc state :base base))
        result (apply/apply-plan (pltu/memory-ops! st) plan {:base     base
                                                             :new-base "new-base"
                                                             :digests  {}
                                                             :head-ok? (constantly true)})]
    [result (if (contains? result :ok) (dissoc @st :base :digests) state)]))

(defn- snippet
  ([id item-name] (snippet id item-name "1 = 1"))
  ([id item-name content] (ptu/item id :snippet item-name nil {:content content})))

(def ^:private id "PreconditionSnippet01")
(def ^:private c (snippet id "Base" "base = 1"))
(def ^:private c2 (snippet id "Local" "local = 1"))

;;; -------------------------------------------------- Preconditions ---------------------------------------------------

(defn- holding
  "The memory instance state in which item `id` has the state `state`: `:live` with the content `content`,
  `:trashed` with it, or `:absent`."
  [state content]
  (case state
    :live    {:snapshot {id content}}
    :trashed {:snapshot {} :trash {id content}}
    :absent  {:snapshot {}}))

(def ^:private cases
  "`[step state content base? satisfied?]`: every state of the item, for each kind of step and precondition, with and
  without a base. 6.5 step 3: a write with `:pre c` needs the live item with `c`; a write with no base content needs
  an absent item, or with a base also a trashed one (a restore); a trash step needs the live item with its `:pre`, or
  an item that is already out of scope."
  (let [write    {:id id :write (snippet id "Theirs" "theirs = 1") :pre c}
        create   {:id id :write (snippet id "Theirs" "theirs = 1") :pre nil}
        trash    {:id id :trash true :pre c}]
    (for [base? [true false]
          row   [[write :live c true] [write :live c2 false] [write :trashed c false] [write :absent nil false]
                 [create :live c false] [create :trashed c base?] [create :absent nil true]
                 [trash :live c true] [trash :live c2 false] [trash :trashed c true] [trash :absent nil true]]]
      (conj row base?))))

(deftest step-preconditions-test
  (doseq [[step state content satisfied? base?] cases]
    (testing (str (if (:trash step) "trash" "write") " with :pre " (pr-str (some-> (:pre step) :name)) ", "
                  (name state) " item, " (if base? "with" "with no") " base")
      (let [before        (holding state content)
            [result after] (apply-to! before [step] (when base? "base"))]
        (if satisfied?
          (is (contains? result :ok))
          (do (is (= {:stale [id]} result))
              (is (= before after))))))))

(deftest trash-step-of-an-item-out-of-scope-is-skipped-test
  (testing "a trash step whose item is already trashed or absent does nothing: the trash keeps its content"
    (let [[result after] (apply-to! (holding :trashed c2) [{:id id :trash true :pre c}] "base")]
      (is (contains? result :ok))
      (is (= {id c2} (:trash after))))))

;;; ---------------------------------------------------- Unique keys ---------------------------------------------------

(def ^:private trashed-id "TrashedActiveOrders01")
(def ^:private new-id "NewActiveOrders000001")

(deftest apply-keeps-unique-keys-fails-test
  (testing "Alloy ApplyKeepsUniqueKeysFails: the snapshot has unique keys, and a snippet in the trash of the instance
            has the name of a new snippet of the plan. The apply refuses with the pair, and writes nothing"
    (let [before         {:snapshot {} :trash {trashed-id (snippet trashed-id "Active orders")}}
          plan           [{:id new-id :write (snippet new-id "Active orders") :pre nil}]
          [result after] (apply-to! before plan "base")]
      (is (= {:key-clash [{:rule :unique-key :kind :snippet :key "Active orders" :ids #{new-id trashed-id}}]} result))
      (is (= before after))))
  (testing "a snippet that the plan trashes keeps its name in the trash, so a new snippet cannot take it"
    (let [before         {:snapshot {trashed-id (snippet trashed-id "Active orders")}}
          plan           [{:id new-id :write (snippet new-id "Active orders") :pre nil}
                          {:id trashed-id :trash true :pre (snippet trashed-id "Active orders")}]
          [result after] (apply-to! before plan "base")]
      (is (= {:key-clash [{:rule :unique-key :kind :snippet :key "Active orders" :ids #{new-id trashed-id}}]} result))
      (is (= before after))))
  (testing "a snippet that the plan renames frees its name for another write of the plan"
    (let [before         {:snapshot {trashed-id (snippet trashed-id "Active orders")}}
          plan           [{:id new-id :write (snippet new-id "Active orders") :pre nil}
                          {:id trashed-id :write (snippet trashed-id "Old orders") :pre (snippet trashed-id "Active orders")}]
          [result after] (apply-to! before plan "base")]
      (is (contains? result :ok))
      (is (= #{"Active orders" "Old orders"} (set (map :name (vals (:snapshot after))))))))
  (testing "a write of an item with its own name is no clash"
    (let [item           (snippet id "Base" "changed = 1")
          [result after] (apply-to! {:snapshot {id c}} [{:id id :write item :pre c}] "base")]
      (is (contains? result :ok))
      (is (= {id item} (:snapshot after)))))
  (testing "two names that differ only in case or accents are one key, as validate compares them"
    (doseq [[held written] [["Filter" "filter"] ["Société" "SOCIETE"]]]
      (testing (str (pr-str held) " in the trash, " (pr-str written) " written")
        (let [before         {:snapshot {} :trash {trashed-id (snippet trashed-id held)}}
              plan           [{:id new-id :write (snippet new-id written) :pre nil}]
              [result after] (apply-to! before plan "base")]
          (is (= {:key-clash [{:rule :unique-key :kind :snippet :key written :ids #{new-id trashed-id}}]} result))
          (is (= before after)))))))

(def ^:private names ["Ana" "Bea" "Cid" "Dan"])
(def ^:private ids ["UniqueKeySnippet00001" "UniqueKeySnippet00002" "UniqueKeySnippet00003" "UniqueKeySnippet00004"])

(def ^:private names-gen
  "Generates a permutation of [[names]], each name in one of its spellings that are one key: as it is, in lower case,
  in upper case, or with an accent on its first letter."
  (gen/let [ns        (gen/shuffle names)
            spellings (gen/vector (gen/elements [identity u/lower-case-en u/upper-case-en
                                                 #(str (first %) "\u0301" (subs % 1))])
                                  (count names))]
    (mapv #(%1 %2) spellings ns)))

(def ^:private key-world-gen
  "Generates `[state target]`: a memory instance state whose snippets (live or trashed) have distinct keys, and a
  target snapshot of snippets with distinct keys. Constructive: the names of each side are a permutation of
  [[names]], in spellings of [[names-gen]], and each identity takes a state."
  (gen/let [row-names    names-gen
            row-states   (gen/vector (gen/elements [:live :trashed :absent]) (count ids))
            target-names names-gen
            in-target    (gen/vector gen/boolean (count ids))]
    (let [rows   (map vector ids row-names row-states)
          state  {:snapshot (into {} (keep (fn [[i n s]] (when (= :live s) [i (snippet i n)]))) rows)
                  :trash    (into {} (keep (fn [[i n s]] (when (= :trashed s) [i (snippet i n)]))) rows)}
          target (into {} (keep (fn [[i n t?]] (when t? [i (snippet i n)]))) (map vector ids target-names in-target))]
      [state target])))

(defn- plan-to
  "The steps that turn the live snippets of `state` into `target`: a write of each item of `target` whose live
  content differs, with the live content as `:pre`, and a trash of each live item that `target` lacks."
  [{:keys [snapshot]} target]
  (into (vec (keep (fn [[i item]] (when (not= item (get snapshot i)) {:id i :write item :pre (get snapshot i)})) target))
        (keep (fn [[i item]] (when-not (contains? target i) {:id i :trash true :pre item})))
        snapshot))

(defn- rows-unique?
  "True iff the snippets of `state`, live and trashed, have distinct keys."
  [{:keys [snapshot trash]}]
  (let [ks (map (comp snapshot/fold-name :name) (concat (vals snapshot) (vals trash)))]
    (= (count ks) (count (distinct ks)))))

(defspec apply-keeps-unique-keys-test 200
  (prop/for-all [[state target] key-world-gen]
    ;; Alloy ApplyKeepsUniqueKeys: with the key precondition, every applied state has unique keys; a refused apply
    ;; names pairs that hold one key, one of them written by the plan, and writes nothing.
    (let [plan           (plan-to state target)
          written        (into #{} (keep #(when (:write %) (:id %))) plan)
          [result after] (apply-to! state plan "base")]
      (if-let [clashes (:key-clash result)]
        (and (= state after)
             (every? (fn [{:keys [rule kind key ids]}]
                       (let [[w & more] (filter written ids)
                             holder     (first (remove written ids))]
                         (and (= [:unique-key :snippet] [rule kind])
                              (= 2 (count ids))
                              (empty? more)
                              (= key (:name (get target w)))
                              (= (snapshot/fold-name key)
                                 (snapshot/fold-name (:name (or (get-in state [:snapshot holder])
                                                                (get-in state [:trash holder]))))))))
                     clashes))
        (and (contains? result :ok)
             (rows-unique? after))))))

(deftest key-world-gen-covers-the-cases-test
  (testing "the generator gives worlds whose apply clashes and worlds whose apply does not"
    (let [worlds  (gen/sample key-world-gen 200)
          results (map (fn [[state target]] (first (apply-to! state (plan-to state target) "base"))) worlds)]
      (is (some :key-clash results))
      (is (some :ok results))
      (testing ", and clashes of two spellings of one key"
        (is (some (fn [[{:keys [snapshot trash]} result]]
                    (some (fn [{:keys [key ids]}]
                            (some #(when-let [held (:name (or (get snapshot %) (get trash %)))]
                                     (and (not= key held)
                                          (= (snapshot/fold-name key) (snapshot/fold-name held))))
                                  ids))
                          (:key-clash result)))
                  (map vector (map first worlds) results)))))))

;;; --------------------------------------------------- System items ---------------------------------------------------

(deftest plan-never-trashes-a-system-item-test
  (testing "a trash step of a system item: the apply refuses it before any step runs, and writes nothing"
    (let [library-id (first (sort snapshot/system-ids))
          library    (ptu/item library-id :collection "Library" nil {:type "library"})
          before     {:snapshot {library-id library id c}}
          plan       [{:id id :write c2 :pre c} {:id library-id :trash true :pre library}]
          [result after] (apply-to! before plan "base")]
      (is (= [[library-id :system-item]] (map (juxt :id :reason) (:refused result))))
      (is (= before after)))))
