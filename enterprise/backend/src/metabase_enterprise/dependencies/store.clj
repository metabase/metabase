(ns metabase-enterprise.dependencies.store
  "Dependency Storage API — protocols for persisting and querying entity
   dependency edges.

   Two protocols:
   - [[DependencyStore]] — mutable storage (write/delete edges, get graph snapshot)
   - [[DependencyGraph]] — read-only query interface (upstream, downstream, cycles)

   Implementations:
   - [[metabase-enterprise.dependencies.store.in-memory]] — atom-backed (checker, tests)
   - [[metabase-enterprise.dependencies.store.database]]  — AppDB-backed (runtime)

   Design note — the graph tells the truth
   ========================================

   DependencyGraph is intentionally unfiltered. It returns the complete dependency
   graph regardless of who is asking. Permission checks, visibility rules, and
   presentation concerns (e.g. \"you can see 3 of 5 dependents\") belong in a
   separate layer above the graph.

   The current API endpoints in dependencies/api.clj bake permission filters into
   the graph walk itself, silently dropping invisible nodes and their entire subtree.
   This is wrong — it hides real impact from the user. The intended migration path:

   1. The graph protocol stays pure (this namespace)
   2. A presentation layer annotates nodes with visibility, showing hidden-node
      counts and preserving transitive impact even through invisible intermediaries
   3. Walk-time options (e.g. skip native cards for metadata updates) are a separate
      concern from permissions — they represent genuine graph semantics, not access
      control. These can be added as options to the transitive-* methods when needed.

   See also: dependencies/api.clj, dependencies/metadata_update.clj")

;;; ===========================================================================
;;; DependencyGraph protocol
;;; ===========================================================================

(defprotocol DependencyGraph
  "Read-only query interface for dependency edges. Obtained via [[DependencyStore/graph]].

   All query methods return `{entity-type #{entity-ids}}`, e.g. `{:card #{1 2} :table #{3}}`."

  (direct-upstream
    [g entity-type entity-id]
    "Direct dependencies of this entity — what it depends on.")

  (direct-downstream
    [g entity-type entity-id]
    "Direct dependents of this entity — what depends on it.")

  (transitive-upstream
    [g entity-type entity-id]
    "All transitive dependencies (does not include the entity itself).")

  (transitive-downstream
    [g entity-type entity-id]
    "All transitive dependents (does not include the entity itself).")

  (find-cycle
    [g entity-type entity-id]
    "If entity is part of an upstream dependency cycle, returns the cycle
     as a vector of [type id] keys, e.g. [[:card 1] [:card 2] [:card 1]].
     Returns nil if no cycle."))

;;; ===========================================================================
;;; DependencyStore protocol
;;; ===========================================================================

(defprotocol DependencyStore
  "Mutable storage of entity dependency edges.
   Write edges with [[store-deps!]]; get a query interface with [[graph]]."

  (store-deps!
    [store entity-type entity-id deps-by-type]
    "Replace ALL outgoing dependency edges for `entity-type`/`entity-id`.
     `deps-by-type` is a map from upstream entity type keyword to a set of IDs,
     matching the output of `deps.calculation/calculate-deps`:
       {:card #{1 2}, :table #{3}}")

  (delete-deps!
    [store entity-type entity-id]
    "Remove ALL outgoing dependency edges for `entity-type`/`entity-id`. No-op
     if no edges exist for this entity.")

  (graph
    [store]
    "Return a [[DependencyGraph]] for querying current edges."))

;;; ===========================================================================
;;; Helpers
;;; ===========================================================================

(defn nodes->deps-map
  "Convert a seq/set of `[entity-type entity-id]` tuples to `{type #{ids}}`.
   Shared by both graph implementations."
  [nodes]
  (reduce (fn [acc [dep-type dep-id]]
            (update acc dep-type (fnil conj #{}) dep-id))
          {}
          nodes))

(defn store?
  "Check if `x` satisfies the [[DependencyStore]] protocol."
  [x]
  (satisfies? DependencyStore x))

(defn dependency-graph?
  "Check if `x` satisfies the [[DependencyGraph]] protocol."
  [x]
  (satisfies? DependencyGraph x))
