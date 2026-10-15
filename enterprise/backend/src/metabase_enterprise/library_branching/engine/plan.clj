(ns metabase-enterprise.library-branching.engine.plan
  "The plan of an apply: the steps that turn the local snapshot into the target snapshot, in an order that an
  instance can write."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Graphs ----------------------------------------------------
;;; A graph is a collection of nodes and a function `succ` from a node to its successors. Both walks below are
;;; iterative, so a long chain of places or references cannot overflow the stack.

(defn- finish-order
  "The nodes of `nodes` in the order in which a depth-first search over `succ` finishes them."
  [nodes succ]
  (loop [roots (seq nodes), stack (), seen #{}, out []]
    (if-let [[node kids] (first stack)]
      (let [kids (drop-while seen kids)]
        (if-let [kid (first kids)]
          (recur roots (conj (rest stack) [node (rest kids)] [kid (succ kid)]) (conj seen kid) out)
          (recur roots (rest stack) seen (conj out node))))
      (if-let [[root & more] roots]
        (if (seen root)
          (recur more stack seen out)
          (recur more (list [root (succ root)]) (conj seen root) out))
        out))))

(defn- components
  "The strongly connected components of the graph `nodes`, `succ`, each a set."
  [nodes succ]
  ;; Kosaraju: walk the reversed graph from each node, in the reverse finish order of a walk of the graph.
  (let [pred (reduce (fn [acc n] (reduce #(update %1 %2 (fnil conj #{}) n) acc (succ n))) {} nodes)]
    (loop [[root & more :as todo] (rseq (finish-order nodes succ)), seen #{}, found []]
      (cond
        (empty? todo) found
        (seen root)   (recur more seen found)
        :else
        (let [members (loop [frontier [root], members #{root}]
                        (if-let [[x & r] (seq frontier)]
                          (let [new (remove #(or (members %) (seen %)) (get pred x))]
                            (recur (into (vec r) new) (into members new)))
                          members))]
          (recur more (into seen members) (conj found members)))))))

(defn- ordered
  "The strongly connected components of the graph on `ids` whose edges are `after` (`{id #{id}}`: the ids that must
  come after it), as sorted vectors, in an order in which every edge between two components goes forward. Of the
  components that may come next, the one with the least identity comes first."
  [ids after]
  (let [succ    (fn [id] (sort snapshot/compare-identities (get after id)))
        comps   (components (sort snapshot/compare-identities ids) succ)
        comp-of (into {} (for [c comps, id c] [id c]))
        least   (into {} (for [c comps] [c (first (sort snapshot/compare-identities c))]))
        next-of (into {} (for [c comps] [c (disj (into #{} (comp (mapcat #(get after %)) (map comp-of)) c) c)]))
        indeg   (frequencies (mapcat next-of comps))
        by-id   #(snapshot/compare-identities (least %1) (least %2))]
    (loop [ready (into (sorted-set-by by-id) (remove #(pos? (get indeg % 0)) comps)), indeg indeg, out []]
      (if-let [c (first ready)]
        (let [nexts (next-of c)
              indeg (reduce #(update %1 %2 dec) indeg nexts)]
          (recur (into (disj ready c) (filter #(zero? (get indeg %)) nexts))
                 indeg
                 (conj out (vec (sort snapshot/compare-identities c)))))
        out))))

;;; ---------------------------------------------------- Steps -----------------------------------------------------

(defn- dependencies
  "`{id #{id}}`: for each id of `ids`, the ids of `ids` that its content in `s` names as its place or as a reference
  target. `skip` is a function from an id to a set of its references to leave out."
  ([s ids]
   (dependencies s ids (constantly #{})))
  ([s ids skip]
   (let [in-ids? (set ids)]
     (into {} (for [id ids
                    :let [{:keys [place refs]} (get s id)]]
                [id (into #{} (filter in-ids?) (cons place (map second (remove (skip id) refs))))])))))

(defn- cycle-refs
  "A function from an id of `ids` to the set of its references in `m`, but those of `(skip id)`, whose target is in its
  own strongly connected component of the dependency graph of `ids` without the references of `skip`: the references
  that close a cycle, a reference to itself included."
  [m ids skip]
  (let [deps    (dependencies m ids skip)
        comp-of (into {} (for [c (components ids #(get deps % #{})), id c] [id c]))]
    (fn [id]
      (into #{}
            (filter (fn [[_role target :as ref]] (and (contains? (comp-of id) target) (not (contains? (skip id) ref)))))
            (:refs (get m id))))))

(defn- cyclic-refs
  "A function from an id of `ids` to the set of its references in `m` that a write leaves out: first the references that
  close a cycle from an item of a kind of `stub-kinds`; then, of each cycle that remains, every reference that closes
  it."
  [m ids stub-kinds]
  (let [first-pass (cycle-refs m ids (constantly #{}))
        stubbed    (memoize (fn [id] (if (contains? stub-kinds (:kind (get m id))) (first-pass id) #{})))
        rest-pass  (cycle-refs m ids stubbed)]
    (fn [id]
      (into (stubbed id) (rest-pass id)))))

(defn- invert
  [deps]
  (reduce-kv (fn [acc id ds] (reduce #(update %1 %2 (fnil conj #{}) id) acc ds)) {} deps))

(defn- write-step
  [m b id defer]
  (cond-> {:id id :write (get m id) :pre (get b id)}
    (seq defer) (assoc :defer defer)))

;;; -------------------------------------------------- Key moves ---------------------------------------------------
;;; The app DB keeps some keys unique over all rows (`snapshot/unique-keys`), so a write must not give an item a key
;;; that another item still has. A key move is a pair `[from to]` of written items: the write of `from` frees a key that
;;; the write of `to` takes.

(defn- key-of
  "`[kind key]`: the unique key of item `it` by `unique-keys`, or nil."
  [unique-keys it]
  (when-some [k (snapshot/unique-key unique-keys it)]
    [(:kind it) k]))

(defn- key-moves
  "The key moves `[from to]` among the items of `ids`: `from` has the key in `l` and not in `m`, and `to` has it in `m`
  and not in `l`."
  [unique-keys l m ids]
  ;; `l` can have two holders of one key: the app DB of `l` can compare names in a form that keeps them apart.
  (let [holders (group-by #(key-of unique-keys (get l %)) ids)]
    (vec (for [to   ids
               :let [k (key-of unique-keys (get m to))]
               :when (some? k)
               from (get holders k)
               :when (and (not= from to) (not= k (key-of unique-keys (get m from))))]
           [from to]))))

(defn- add-edges
  [after edges]
  (reduce (fn [acc [from to]] (update acc from (fnil conj #{}) to)) after edges))

(defn- interim-ids
  "The items of `ids` that free their key in an interim step before every write: the `from` of each move of `moves` for
  which `late?` is true; then, while the graph of `after` and the other moves has a cycle, the least `from` of a move
  inside each cycle. Every cycle has a move, because `after` has no cycle."
  [ids after moves late?]
  (loop [interim (into #{} (comp (filter (comp late? first)) (map first)) moves)]
    (let [edges (remove (comp interim first) moves)
          succ  (add-edges after edges)
          picks (for [c (components (sort snapshot/compare-identities ids) #(get succ % #{}))
                      :when (next c)]
                  (->> edges
                       (keep (fn [[from to]] (when (and (c from) (c to)) from)))
                       (sort snapshot/compare-identities)
                       first))]
      (if (seq picks)
        (recur (into interim picks))
        interim))))

(defn- temporary-keys
  "`{id name}`: for each item of `ids`, a temporary name that is the key of no item of `l` or `m`, and of no other item
  of `ids`."
  [unique-keys l m ids]
  (loop [[id & more :as todo] (sort snapshot/compare-identities ids)
         taken                (set (keep #(snapshot/unique-key unique-keys %) (concat (vals l) (vals m))))
         out                  {}]
    (if (empty? todo)
      out
      (let [candidates (iterate #(str % "~") (str "Library branching temporary name " id))
            temp       (first (remove (comp taken snapshot/fold-name) candidates))]
        (recur more (conj taken (snapshot/fold-name temp)) (assoc out id temp))))))

(defn- interim-steps
  [unique-keys l m ids]
  (for [[id temp] (sort-by key snapshot/compare-identities (temporary-keys unique-keys l m ids))
        :let [item (get l id)]]
    {:id id :interim (assoc-in item (:path (get unique-keys (:kind item))) temp)}))

(defn- write-steps
  "`[interims writes links]` for the items of `ids`, which `m` holds."
  [unique-keys stub-kinds l m b ids]
  (let [deferred (cyclic-refs m ids stub-kinds)
        after    (invert (dependencies m ids deferred))
        moves    (key-moves unique-keys l m ids)
        ;; The write of an item that exists and has deferred references leaves it as it is, and its link writes its
        ;; key, after every write.
        late?    #(and (some? (get b %)) (seq (deferred %)))
        interim  (interim-ids ids after moves late?)
        order    (apply concat (ordered ids (add-edges after (remove (comp interim first) moves))))]
    [(vec (interim-steps unique-keys l m interim))
     (mapv #(write-step m b % (deferred %)) order)
     (into [] (keep #(when-let [refs (not-empty (deferred %))] {:id % :link refs})) order)]))

(defn- cycle-start
  "The item of cycle `ids` (a sorted vector) that goes to the trash first: the least one that is the place of no other
  item of `ids`."
  [l ids]
  (let [places (set (keep #(:place (get l %)) ids))]
    ;; A containment cycle has no such item; a well-formed `l` has none.
    (or (first (remove places ids)) (first ids))))

(defn- split-cycle
  "`[group]` for a group of one item; else `[[start] rest]`, the first trash of the cycle `ids` and the rest of it."
  [l ids]
  (if (next ids)
    (let [start (cycle-start l ids)]
      [[start] (vec (remove #{start} ids))])
    [ids]))

(defn- trash-steps
  "The trash steps for the items of `ids`, which the target snapshot lacks: the content and the users of an item first.
  A cycle of places and references starts at [[cycle-start]]; then the rest of the cycle follows the same rule."
  [l b ids]
  ;; `todo` is a stack of groups of ids. A group of one item is the next trash. A larger group is split into its
  ;; cycles in order, and each cycle into its start and its rest.
  (loop [todo [(vec ids)], out []]
    (if-let [group (peek todo)]
      (let [todo (pop todo)]
        (if (next group)
          (recur (into todo (rseq (into [] (mapcat #(split-cycle l %)) (ordered group (dependencies l group)))))
                 out)
          (recur todo (into out (map (fn [id] {:id id :trash true :pre (get b id)})) group))))
      out)))

(defn- kind-changes
  "The identities of `ids` whose items in `l` and in `m` are of kinds of two tables ([[snapshot/same-row?]]): the item
  of `l` goes to the trash, and the item of `m` is a new one."
  [l m ids]
  (filterv (fn [id]
             (let [old (get l id), new (get m id)]
               (and old new (not (snapshot/same-row? (:kind old) (:kind new))))))
           ids))

(defn- check-base-equal!
  [l b changed]
  (when-let [ids (not-empty (filterv (fn [id] (not= (get l id) (get b id))) changed))]
    (throw (ex-info (str "The target snapshot changes items that have a local change: " (pr-str ids))
                    {:ids ids}))))

(defn- check-system-kept!
  [system removed]
  (when-let [ids (not-empty (filterv system removed))]
    (throw (ex-info (str "The target snapshot removes system items: " (pr-str ids))
                    {:system-ids ids}))))

(defn plan
  "The steps that turn the local snapshot `l` into the target snapshot `m`, given the base snapshot `b`. `m` must be
  well formed, and:
  - `m` must not change an item whose content in `l` differs from `b` (a merge result of `l` never does); else this
    throws an ex-info with `:ids`. A value of `b` can be `:unknown`, which equals no content, so an item with an
    unknown base that `m` changes is such an item, and no step has `:pre :unknown`;
  - `m` must hold each system item of `l` (`opts` `:system`, a set of identities; default [[snapshot/system-ids]]),
    with a kind of the same table ([[snapshot/same-row?]]); else this throws an ex-info with `:system-ids`, the
    identities of those that it lacks.

  `opts` `:unique-keys` (default [[snapshot/unique-keys]]) names the keys that no two items may have at one time; a
  key is a name.

  Steps, in this order:
  - interims `{:id i :interim c}`: `c` is `l(i)` with a temporary name, which frees the key of `i` for a write that
    takes it. An item has one when the moves of keys among the writes make a cycle (a swap), or when its write leaves
    it as it is (see `:defer`) and another write takes its key;
  - writes `{:id i :write m(i) :pre b(i)}`: a container and a reference target before the items that use them, and a
    write that frees a key before the write that takes it. In a reference cycle, a write has `:defer #{ref}`, the
    references that it leaves out: those of the items of a kind of `opts` `:stub-kinds` (default
    [[snapshot/stub-kinds]]) when that breaks the cycle, else every reference that closes it. An item whose kind in
    `m` is a kind of another table than in `l` is replaced: its write has `:pre nil`, and the item of `l` has a trash
    step;
  - links `{:id i :link #{ref}}`: each sets the deferred references of `i`;
  - trashes `{:id i :trash true :pre b(i)}`, of the items that `m` lacks or replaces: an item before its container,
    and before the items that it refers to.
    A cycle of places and references starts with its least item that contains no other item of the cycle; the rest
    of the cycle follows these rules again. So only the references to the first item of a cycle go to the trash
    before their users.

  Of the steps that may come next, the step of the least identity comes first. Each `:pre` is the content that the
  item must have before the first step (nil: no item). A trash does not free a key: a trashed item keeps it."
  ([l m b]
   (plan l m b {}))
  ([l m b {:keys [system unique-keys stub-kinds]
           :or   {system snapshot/system-ids unique-keys snapshot/unique-keys stub-kinds snapshot/stub-kinds}}]
   (let [changed  (sort snapshot/compare-identities
                        (filter #(not= (get l %) (get m %)) (set/union (set (keys l)) (set (keys m)))))
         replaced (kind-changes l m changed)
         removed  (sort snapshot/compare-identities (concat (remove #(contains? m %) changed) replaced))]
     (check-base-equal! l b changed)
     (check-system-kept! system removed)
     ;; The write of a replaced item makes a new item: no local content, and no base content as its precondition.
     (let [[interims writes links] (write-steps unique-keys stub-kinds (apply dissoc l replaced) m
                                                (apply dissoc b replaced) (filter #(contains? m %) changed))
           trashes                 (trash-steps l b removed)]
       (vec (concat interims writes links trashes))))))
