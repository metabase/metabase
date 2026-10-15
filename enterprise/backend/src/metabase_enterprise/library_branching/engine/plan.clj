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

(defn- cyclic-refs
  "A function from an id of `ids` to the set of its references in `m` whose target is in its own strongly connected
  component of the dependency graph of `ids`: the references that close a cycle, a reference to itself included."
  [m ids]
  (let [deps    (dependencies m ids)
        comp-of (into {} (for [c (components ids #(get deps % #{})), id c] [id c]))]
    (fn [id]
      (into #{} (filter (fn [[_role target]] (contains? (comp-of id) target))) (:refs (get m id))))))

(defn- invert
  [deps]
  (reduce-kv (fn [acc id ds] (reduce #(update %1 %2 (fnil conj #{}) id) acc ds)) {} deps))

(defn- write-step
  [m b id defer]
  (cond-> {:id id :write (get m id) :pre (get b id)}
    (seq defer) (assoc :defer defer)))

(defn- write-steps
  "`[writes links]` for the items of `ids`, which `m` holds."
  [m b ids]
  (let [deferred (cyclic-refs m ids)
        after    (invert (dependencies m ids deferred))
        order    (apply concat (ordered ids after))]
    [(mapv #(write-step m b % (deferred %)) order)
     (into [] (keep #(when-let [refs (not-empty (deferred %))] {:id % :link refs})) order)]))

(defn- trash-steps
  "The trash steps for the items of `ids`, which the target snapshot lacks: the content and the users of an item first. In a
  reference cycle, the references give no order."
  [l b ids]
  (let [after (dependencies l ids (cyclic-refs l ids))]
    (into [] (comp cat (map (fn [id] {:id id :trash true :pre (get b id)}))) (ordered ids after))))

(defn- check-base-equal!
  [l b changed]
  (when-let [ids (not-empty (filterv #(not= (get l %) (get b %)) changed))]
    (throw (ex-info (str "The target snapshot changes items that have a local change: " (pr-str ids))
                    {:ids ids}))))

(defn plan
  "The steps that turn the local snapshot `l` into the target snapshot `m`, given the base snapshot `b`. `m` must not
  change an item whose content in `l` differs from `b` (a merge result of `l` never does); else this throws an
  ex-info with `:ids`. `m` must be well formed.

  Steps, in this order:
  - writes `{:id i :write m(i) :pre b(i)}`: a container and a reference target before the items that use them. In a
    reference cycle, a write has `:defer #{ref}`, the references that it leaves out;
  - links `{:id i :link #{ref}}`: each sets the deferred references of `i`;
  - trashes `{:id i :trash true :pre b(i)}`: an item before its container, and before the items that it refers to
    unless they are on a reference cycle with it.

  Of the steps that may come next, the step of the least identity comes first. Each `:pre` is the content that the
  item must have when the step runs (nil: no item)."
  ([l m b]
   (plan l m b {}))
  ([l m b _opts]
   (let [changed (sort snapshot/compare-identities
                       (filter #(not= (get l %) (get m %)) (set/union (set (keys l)) (set (keys m)))))]
     (check-base-equal! l b changed)
     (let [[writes links] (write-steps m b (filter #(contains? m %) changed))
           trashes        (trash-steps l b (remove #(contains? m %) changed))]
       (vec (concat writes links trashes))))))
