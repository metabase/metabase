(ns metabase.graph.core
  "Interface to a library of generic graph walking functionality.

  Used for eg. walking the `enterprise/dependencies` graph, or similar directed graphs.

  Implementation-agnostic! The graph representation is wrapped by a protocol exported from this module, which can be
  used to write graph searches which can run in memory, against AppDB, on the filesystem, etc.

  Each graph defines an arbitrary **key**. This can be any hash map key, such as a number, a `[type id]` pair, etc."
  (:require
   #?@(:cljs ([flatland.ordered.set :as oset]))
   [medley.core :as m]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p])
  #?@(:clj ((:import java.util.LinkedHashSet))))

#?(:clj (set! *warn-on-reflection* true))

(p/defprotocol+ Graph
  (children-of [graph key-seq]
    "Given a graph and a seq of keys, returns a map from each input key to the set of keys **directly reachable** from
    that key.

    If you want a *transitive* search, call [[transitive]].

    Contract details:
    - If a key is not known in the graph, it should be missing from the output map.
    - If a key is found in the graph, and it has no children, its value is `#{}`.
    - If the input `key-seq` is empty, return `{}`."))

(p/deftype+ CachedGraph [graph cache]
  Graph
  (children-of [_this key-seq]
    (let [new-cache (swap! cache (fn [current-cache]
                                   (let [current-keys (into #{} (keys current-cache))
                                         missing-keys (remove current-keys key-seq)]
                                     (->> (children-of graph missing-keys)
                                          (merge current-cache)))))]
      (select-keys new-cache key-seq))))

(defn cached-graph
  "Wraps a graph with an implementation that automatically caches results."
  [graph]
  (->CachedGraph graph (atom {})))

(defn graph?
  "Whether `x` is a valid `Graph`."
  [x]
  #?(:clj  (extends? Graph (class x))
     :cljs (satisfies? Graph x)))

(mr/def ::graph
  "Schema for anything that satisfies the [[Graph]] protocol."
  [:fn
   {:error/message "Valid Graph instance"}
   #'graph?])

(mr/def ::node :any)

(mr/def ::child-map [:map-of ::node [:set ::node]])

(defn- stable-iteration-set []
  ;; Both of these sets explicitly have stable iteration order: values are returned in the order of (first) insertion.
  #?(:clj  (let [s (LinkedHashSet.)]
             {:insert-many! #(.addAll s %)
              :seen?        #(.contains s %)
              :->iterable   (constantly s)})
     :cljs (let [s (volatile! (oset/ordered-set))]
             {:insert-many! #(vswap! s into %)
              :seen?        #(contains? @s %)
              :->iterable   #(deref s)})))

(defn transitive
  "Given a graph and `key-seq`, returns a seq of all transitive children of those starting keys.

  The returned seq:
  - Excludes the input keys, even if they're reachable from the input keys.
  - Contains each key only once, even if it can be reached by multiple paths.
  - Is **topologically sorted**: all keys reachable in `n` steps from the starters appear before any keys reachable
    in `n+1` steps, etc.
  - Makes no guarantee about the order of keys at the same \"level\".
    - That is, if two keys `k1` and `k2` are reachable in no fewer than `n` steps from the starters, then `k1` might
      precede or follow `k2` in the output seq."
  [graph key-seq]
  (let [{:keys [insert-many! seen? ->iterable]} (stable-iteration-set)]
    (insert-many! key-seq)
    (loop [new-keys key-seq]
      (if (seq new-keys)
        (let [k->children  (children-of graph new-keys)
              new-children (into #{} (comp cat (remove seen?)) (vals k->children))]
          (insert-many! new-children)
          (recur new-children))
        (drop (count key-seq) (->iterable))))))

(mu/defn transitive-children-of :- ::child-map
  "Given a graph and `key-seq`, finds all transitive children and returns a map of `{parent #{child}}`.

  Also takes in an optional filter for those children.

  Effectively, this is just `children-of` except transitive children are included and the potential filter."
  [graph :- ::graph
   key-seq :- [:sequential ::node]]
  (loop [to-traverse (into #{} key-seq)
         child-map {}]
    (let [new-children (children-of graph to-traverse)
          new-traverse (into #{}
                             (comp (remove child-map) cat)
                             (vals new-children))
          new-child-map (into child-map new-children)]
      (if (seq new-traverse)
        (recur new-traverse new-child-map)
        new-child-map))))

(mu/defn all-map-nodes :- [:sequential :any]
  "Returns every node mentioned in `children`."
  [children :- ::child-map]
  (-> (into (set (keys children))
            cat
            (vals children))
      sort))

(mu/defn keep-children :- [:sequential :any]
  "Iterates through a child map, calls `f` for each node, and returns the non-nil results as a list.

  Nodes are guaranteed to be in a consistent order, and parents are guaranteed to be before their children.

  If `f` ever returns `:metabase.graph.core/stop`, `keep-children` does not include that in the results and does not
  recurse down the current node's children."
  [f :- [:-> ::node :any]
   children :- ::child-map]
  (let [all-nodes (all-map-nodes children)
        full-parent-map (->> children
                             (mapcat (fn [[parent current-children]]
                                       (map (fn [child]
                                              {child #{parent}})
                                            current-children)))
                             (apply merge-with into))]
    (loop [nodes-remaining all-nodes
           parent-map full-parent-map
           ignored #{}
           result []]
      (if-let [next-node (some #(when-not (or (seq (parent-map %))
                                              (ignored %))
                                  %)
                               nodes-remaining)]
        (let [new-value (f next-node)
              new-nodes-remaining (remove #(= % next-node) nodes-remaining)]
          (case new-value
            nil (recur new-nodes-remaining
                       (m/map-vals #(disj % next-node) parent-map)
                       ignored
                       result)
            ::stop (recur new-nodes-remaining
                          parent-map
                          (conj ignored next-node)
                          result)
            (recur new-nodes-remaining
                   (m/map-vals #(disj % next-node) parent-map)
                   ignored
                   (conj result new-value))))
        result))))

(defn calc-edges-between
  "Calculates the edges within `nodes`, based on `graph`."
  [graph nodes]
  (let [node-set (into #{} nodes)
        all-children (children-of graph nodes)
        edges (for [[[parent-type parent-id] children] all-children
                    [child-type child-id] children
                    :when (node-set [child-type child-id])]
                {:from_entity_type child-type
                 :from_entity_id   child-id
                 :to_entity_type   parent-type
                 :to_entity_id     parent-id})]
    edges))

;; ## In-memory Graphs
(p/deftype+ InMemoryGraph [adjacency-map]
  Graph
  (children-of [_this key-seq]
    (select-keys adjacency-map key-seq)))

(defn in-memory
  "Given a map of which keys are reachable from each key, `{key #{key...}, ...}`, returns an instance of [[Graph]]
  backed by this in-memory graph.

  Note that this map is in the same form as [[children-of]] returns."
  [adjacency-map]
  (->InMemoryGraph adjacency-map))

;; TODO: (Braden, 09/19/2025) We may find use for some extra helpers. For example, a wrapper that implements the
;; multi-key [[children-of]] on top of a single-key `(children graph key) => #{keys...}` function.
;; But YAGNI, so since I don't have a use-case in mind right now, I'm just leaving a note.
