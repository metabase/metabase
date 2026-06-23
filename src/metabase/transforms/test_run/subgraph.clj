(ns metabase.transforms.test-run.subgraph
  "Sub-graph resolution for chained transform test runs.

  Given a *target* transform, a set of selected *source* transforms, and the full
  set of transforms, compute the executable slice: the transform nodes to run, the
  topological order to run them in, and the boundary *leaf* inputs the caller must
  supply as fixtures.

  ## The model

  The user selects the **boundary** source transforms plus a single target; every
  node *between* a source and the target is auto-included. A node's input table is
  a **leaf** (needs a fixture) iff no node *in the slice* produces it — this covers
  both raw warehouse tables and *sibling* outputs (a node feeding the slice that
  the user did not select as a source). Selecting only the target reduces to Phase
  1 single-transform testing.

  ## Reuse

  Builds entirely on `transforms-base.ordering`: `transform-ordering` for the
  target's upstream dependency closure, and `dependency-producer-map` to classify
  each node's raw inputs as produced-internally vs. boundary leaves. This is new
  *traversal*, not new graph code."
  (:require
   [clojure.set :as set]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Pure graph helpers
;;; ---------------------------------------------------------------------------

(defn- reverse-edges
  "Invert a dependency map `{id -> #{upstream-ids}}` into `{id -> #{downstream-ids}}`.
  Every id in the input appears as a key in the output (with at least `#{}`)."
  [deps]
  (reduce-kv
   (fn [m id ups]
     (reduce (fn [m up] (update m up (fnil conj #{}) id))
             (update m id #(or % #{}))
             ups))
   {}
   deps))

(defn- reachable
  "Set of nodes reachable from `start-ids` (inclusive) following `adj` (id -> #{children})."
  [adj start-ids]
  (loop [seen #{}, queue (vec start-ids)]
    (if-let [x (first queue)]
      (if (seen x)
        (recur seen (rest queue))
        (recur (conj seen x) (into (rest queue) (adj x))))
      seen)))

(defn- topo-order
  "Kahn topological sort of `node-set` using dependency map `deps` (id -> #{upstream}).
  Dependencies outside `node-set` are ignored (the slice is run hermetically).
  Ties are broken by `id` ascending for determinism. Throws on a cycle."
  [deps node-set]
  (let [in-set-deps (into {} (for [n node-set]
                               [n (set/intersection (get deps n #{}) node-set)]))]
    (loop [order [], remaining in-set-deps]
      (if (empty? remaining)
        order
        (let [ready (sort (for [[n d] remaining :when (empty? d)] n))]
          (when (empty? ready)
            (throw (ex-info "Cycle detected in transform sub-graph"
                            {:error-type ::cycle :remaining (vec (keys remaining))})))
          (recur (into order ready)
                 (reduce (fn [m r]
                           (-> (dissoc m r)
                               (update-vals #(disj % r))))
                         remaining
                         ready)))))))

;;; ---------------------------------------------------------------------------
;;; Slice computation (pure)
;;; ---------------------------------------------------------------------------

(defn compute-slice
  "Pure slice computation over a dependency map.

  `deps` is the target's upstream dependency closure (`{id -> #{upstream-ids}}`,
  as produced by `ordering/transform-ordering`). Returns:

      {:slice       #{transform-ids}   ; sources..target inclusive, interior auto-included
       :order       [transform-ids]    ; topological (upstream first)
       :bad-sources #{transform-ids}}  ; selected sources that are not ancestors of target

  The slice is `closure ∩ descendants-or-self(sources)`, always including the
  target. `:bad-sources` is non-empty when a selected source does not feed the
  target — callers should fail closed rather than run a degenerate slice."
  [deps source-ids target-id]
  (let [closure     (set (keys deps))
        bad-sources (set/difference (set source-ids) closure)
        descendants (reachable (reverse-edges deps) source-ids)
        slice       (conj (set/intersection closure descendants) target-id)]
    {:slice       slice
     :order       (topo-order deps slice)
     :bad-sources bad-sources}))

;;; ---------------------------------------------------------------------------
;;; Leaf detection
;;; ---------------------------------------------------------------------------

(defn leaf-deps
  "Boundary input deps for `slice` — every node's raw input dep whose producing
  transform is NOT in the slice.

  `id->raw-deps` maps a transform id to its `table-dependencies` (a seq of raw-dep
  maps); `producer-of` is the function from `ordering/dependency-producer-map`
  (raw-dep -> producing-transform-id|nil). A dep is a leaf iff `(producer-of dep)`
  is nil (raw warehouse table) or not in `slice` (a sibling output). In-slice
  producers are satisfied internally.

  Returns a set of raw-dep maps (the same shapes `table-dependencies` emits)."
  [slice id->raw-deps producer-of]
  (into #{}
        (for [id  slice
              dep (id->raw-deps id)
              :when (not (contains? slice (producer-of dep)))]
          dep)))

;;; ---------------------------------------------------------------------------
;;; Public entry point
;;; ---------------------------------------------------------------------------

(defn resolve-subgraph
  "Resolve the executable sub-graph for a chained test run.

  Arguments:
  - `target-id`      — the target transform id (the node whose output is diffed).
  - `source-ids`     — set of selected boundary source transform ids.
  - `all-transforms` — the full transform set (resolution context for the DAG).

  Returns:

      {:slice     #{transform-ids}       ; nodes to run
       :order     [transform-ids]        ; topological run order
       :leaf-deps #{raw-dep-maps}}       ; boundary inputs needing fixtures

  Throws `ex-info` with `:error-type ::sources-not-ancestors` when any selected
  source does not feed the target (fail closed — no degenerate slice)."
  [target-id source-ids all-transforms]
  (let [{deps :dependencies} (ordering/transform-ordering [target-id] all-transforms)
        {:keys [slice order bad-sources]} (compute-slice deps source-ids target-id)]
    (when (seq bad-sources)
      (throw (ex-info
              (str "Selected source transform(s) do not feed the target transform: "
                   (pr-str (vec (sort bad-sources)))
                   ". Every source must be an upstream dependency of the target.")
              {:error-type  ::sources-not-ancestors
               :bad-sources bad-sources
               :target-id   target-id})))
    (let [id->transform (u/index-by :id all-transforms)
          producer-of   (ordering/dependency-producer-map all-transforms)]
      {:slice     slice
       :order     order
       :leaf-deps (leaf-deps slice
                             #(transforms-base.i/table-dependencies (id->transform %))
                             producer-of)})))
