(ns metabase-enterprise.dependencies.store.in-memory
  "Atom-backed [[DependencyStore]] and [[DependencyGraph]] for offline use
   (checker, tests). No database dependencies."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.store :as deps.store]
   [metabase.graph.core :as graph.core]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Key helpers
;;; ===========================================================================

(defn- ->key [entity-type entity-id]
  [entity-type entity-id])

(defn- deps->edge-keys
  "Converts `deps-by-type` {:card #{1 2}, :table #{3}} into a set of outgoing
   edge keys #{[:card 1] [:table 3]}."
  [deps-by-type]
  (into #{}
        (mapcat (fn [[dep-type dep-ids]]
                  (map (partial ->key dep-type) dep-ids)))
        deps-by-type))

;;; ===========================================================================
;;; Store internals — bidirectional edge maintenance
;;; ===========================================================================

(defn- swap-outgoing!
  "Atomically replace outgoing edges for `from-key` with `new-dep-keys`.
   Updates both `:outgoing` and `:incoming` maps in one [[swap!]]."
  [edges-atom from-key new-dep-keys]
  (swap! edges-atom
         (fn [{:keys [outgoing incoming] :as _edges}]
           (let [old-dep-keys (get outgoing from-key #{})
                 removed (set/difference old-dep-keys new-dep-keys)
                 added   (set/difference new-dep-keys old-dep-keys)
                 incoming (as-> incoming $
                            (reduce (fn [m dep-key]
                                      (let [s (disj (get m dep-key #{}) from-key)]
                                        (if (seq s)
                                          (assoc m dep-key s)
                                          (dissoc m dep-key))))
                                    $
                                    removed)
                            (reduce (fn [m dep-key]
                                      (update m dep-key (fnil conj #{}) from-key))
                                    $
                                    added))]
             {:outgoing  (if (seq new-dep-keys)
                           (assoc outgoing from-key new-dep-keys)
                           (dissoc outgoing from-key))
              :incoming incoming})))
  nil)

;;; ===========================================================================
;;; InMemoryDependencyGraph — point-in-time snapshot
;;; ===========================================================================

(defrecord InMemoryDependencyGraph [outgoing incoming]
  deps.store/DependencyGraph
  (direct-upstream [_ entity-type entity-id]
    (deps.store/nodes->deps-map (get outgoing (->key entity-type entity-id) #{})))

  (direct-downstream [_ entity-type entity-id]
    (deps.store/nodes->deps-map (get incoming (->key entity-type entity-id) #{})))

  (transitive-upstream [_ entity-type entity-id]
    (deps.store/nodes->deps-map
     (graph.core/transitive (graph.core/in-memory outgoing)
                            [(->key entity-type entity-id)])))

  (transitive-downstream [_ entity-type entity-id]
    (deps.store/nodes->deps-map
     (graph.core/transitive (graph.core/in-memory incoming)
                            [(->key entity-type entity-id)])))

  (find-cycle [_ entity-type entity-id]
    (graph.core/find-cycle (graph.core/in-memory outgoing)
                           [(->key entity-type entity-id)])))

;;; ===========================================================================
;;; InMemoryDependencyStore
;;; ===========================================================================

(defrecord InMemoryDependencyStore [edges-atom]
  deps.store/DependencyStore
  (store-deps! [_ entity-type entity-id deps-by-type]
    (let [from-key (->key entity-type entity-id)
          dep-keys (deps->edge-keys deps-by-type)]
      (swap-outgoing! edges-atom from-key dep-keys)))

  (delete-deps! [_ entity-type entity-id]
    (swap-outgoing! edges-atom (->key entity-type entity-id) #{}))

  (deps.store/graph [_]
    (let [{:keys [outgoing incoming]} @edges-atom]
      (->InMemoryDependencyGraph outgoing incoming))))

(defn in-memory-dependency-store
  "Create a fresh empty [[InMemoryDependencyStore]]."
  []
  (->InMemoryDependencyStore (atom {:outgoing {} :incoming {}})))
