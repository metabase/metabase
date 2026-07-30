(ns metabase-enterprise.transforms-verification.subgraph
  "Sub-graph resolution for chained transform test runs.

  Given a *target* (a transform id or a card) and a set of user-selected *source*
  transforms, compute the executable slice: the transform nodes to run, the
  topological order to run them in, and the boundary *leaf* inputs the caller must
  supply as fixtures.

  ## The model

  The user selects the **boundary** source transforms plus a single target; every
  node *between* a source and the target is auto-included. A node's input table is
  a **leaf** (needs a fixture) iff no node *in the slice* produces it — this covers
  both raw warehouse tables and *sibling* outputs (a node feeding the slice that
  the user did not select as a source). Selecting only the target reduces to
  single-transform testing.

  Two entry points:

  - [[resolve-subgraph]] — transform target: seed-ids = `#{target-id}`.
  - [[resolve-card-subgraph]] — card target: seed-ids = producing-transform ids
    of the physical tables the card reads; the card's raw-table refs become
    immediate fixtures independent of the selected sources."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.transforms-verification.card-refs :as card-refs]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

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
            (throw (errors/ex ::errors/cycle (tru "Cycle detected in transform sub-graph")
                              {:remaining (vec (keys remaining))})))
          (recur (into order ready)
                 (reduce (fn [m r]
                           (-> (dissoc m r)
                               (update-vals #(disj % r))))
                         remaining
                         ready)))))))

;;; ---------------------------------------------------------------------------
;;; Slice computation (pure, multi-seed)
;;; ---------------------------------------------------------------------------

(defn compute-slice
  "Pure slice computation over a dependency map.

  `deps` is the upstream dependency closure of the seed transforms
  (`{id -> #{upstream-ids}}`, as produced by `ordering/transform-ordering`).

  `seed-ids` is the set of nodes that must always be included in the slice (the
  \"top\" of the sub-graph — the transform target for a transform target run, or
  the set of producing transforms for a card target run). Returns:

      {:slice       #{transform-ids}   ; sources..seeds inclusive, interior auto-included
       :order       [transform-ids]    ; topological (upstream first)
       :bad-sources #{transform-ids}}  ; selected sources that are not ancestors of any seed

  The slice is `(closure ∩ descendants-or-self(sources)) + seed-ids`.
  `:bad-sources` is non-empty when a selected source does not feed any seed —
  callers should fail closed rather than run a degenerate slice."
  [deps source-ids seed-ids]
  (let [closure     (set (keys deps))
        bad-sources (set/difference (set source-ids) closure)
        descendants (reachable (reverse-edges deps) source-ids)
        slice       (into (set/intersection closure descendants) seed-ids)]
    {:slice       slice
     :order       (topo-order deps slice)
     :bad-sources bad-sources}))

;;; ---------------------------------------------------------------------------
;;; Leaf detection
;;; ---------------------------------------------------------------------------

(defn leaf-deps
  "Boundary input deps for `slice` — every node's raw input dep whose producing
  transform is outside the slice.

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
;;; Typed dependency extraction
;;; ---------------------------------------------------------------------------

(defn- table-dependencies!
  "`transforms-base.i/table-dependencies` under the test-run error contract: any
  throw becomes `::errors/cannot-determine-inputs`, carrying the transform id and
  the original exception as cause."
  [transform]
  (try
    (transforms-base.i/table-dependencies transform)
    (catch Throwable e
      (throw (errors/ex ::errors/cannot-determine-inputs
                        (str "Cannot determine input tables for transform " (:id transform)
                             ". Dependency extraction failed: " (ex-message e))
                        {:transform-id (:id transform)}
                        e)))))

(defn- assert-extractions-ok!
  "`transform-ordering` swallows per-node `table-dependencies` throws, recording
  the node in `failed` and treating it as dependency-less — which would silently
  misshape the slice. Fail closed instead: re-run extraction on the first failed
  node so the throw carries the real cause (deterministic — same snapshot)."
  [failed id->transform]
  (when-let [id (first (sort failed))]
    (table-dependencies! (id->transform id))
    ;; Reachable only if the re-run stopped failing between the walk and here.
    (throw (errors/ex ::errors/cannot-determine-inputs
                      (str "Cannot determine input tables: dependency extraction failed"
                           " for transform(s) " (pr-str (vec (sort failed))) ".")
                      {:transform-ids (vec (sort failed))}))))

;;; ---------------------------------------------------------------------------
;;; Public entry points
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

  Throws `ex-info` with `:error-type ::errors/sources-not-ancestors` when any selected
  source does not feed the target (fail closed — no degenerate slice), or
  `::errors/cannot-determine-inputs` when dependency extraction fails for any node
  in the target's upstream closure."
  [target-id source-ids all-transforms]
  (let [id->transform (u/index-by :id all-transforms)
        {deps :dependencies failed :failed} (ordering/transform-ordering [target-id] all-transforms)
        _ (assert-extractions-ok! failed id->transform)
        {:keys [slice order bad-sources]} (compute-slice deps source-ids #{target-id})]
    (when (seq bad-sources)
      (throw (errors/ex ::errors/sources-not-ancestors
                        (tru "Selected source transform(s) do not feed the target transform: {0}. Every source must be an upstream dependency of the target."
                             (pr-str (vec (sort bad-sources))))
                        {:bad-sources bad-sources
                         :target-id   target-id})))
    (let [producer-of (ordering/dependency-producer-map all-transforms)]
      {:slice     slice
       :order     order
       :leaf-deps (leaf-deps slice
                             #(table-dependencies! (id->transform %))
                             producer-of)})))

(defn resolve-card-subgraph
  "Resolve the executable sub-graph for a card-target test run — the card analogue
  of [[resolve-subgraph]].

  Arguments:
  - `card`           — a `:model/Card` row with a `:dataset_query` key.
  - `source-ids`     — the user's chosen boundary source transform ids; the slice
                       runs from them up to the transforms that produce the card's
                       tables. A source ancestral to none of those is rejected.
  - `all-transforms` — the full transform set, read once by the caller for a
                       consistent snapshot of the DAG.

  Returns:

      {:slice     #{transform-ids}   ; transform nodes to run
       :order     [transform-ids]    ; topological run order, upstream first
       :leaf-deps #{raw-dep-maps}}   ; boundary inputs needing CSV fixtures

  `:leaf-deps` gathers two kinds of boundary table under one `{:table id}` shape:
  the sub-graph's own leaves, and the tables the card reads that no in-slice
  transform produces — production lookups and dimensions among them. The caller
  must supply a fixture for each.

  Throws `ex-info` with `:error-type ::errors/sources-not-ancestors` when a selected
  source feeds none of the card's producing transforms — the same fail-closed
  contract as [[resolve-subgraph]] — or `::errors/cannot-determine-inputs` when
  dependency extraction fails for any node in the seeds' upstream closure."
  [card source-ids all-transforms]
  (let [card-table-ids (card-refs/card->tables card)
        id->transform  (u/index-by :id all-transforms)
        producer-of    (ordering/dependency-producer-map all-transforms)
        ;; Classify each physical table the card reads: nil-producer tables are
        ;; immediate fixture leaves; produced tables seed the slice.
        {seed-table-ids    true
         boundary-table-ids false}
        (group-by (fn [tid] (some? (producer-of {:table tid}))) card-table-ids)
        seed-ids           (into #{} (keep (fn [tid] (producer-of {:table tid}))) seed-table-ids)
        ;; Walk the seed transforms' upstream closure, then apply the source-id cutoff.
        {deps :dependencies failed :failed} (ordering/transform-ordering (vec seed-ids) all-transforms)
        _ (assert-extractions-ok! failed id->transform)
        {:keys [slice order bad-sources]} (compute-slice deps source-ids seed-ids)]
    (when (seq bad-sources)
      (throw (errors/ex ::errors/sources-not-ancestors
                        (tru "Selected source transform(s) do not feed any of the card''s producing transforms: {0}. Every source must be an upstream dependency of a transform that produces a table the card reads."
                             (pr-str (vec (sort bad-sources))))
                        {:bad-sources bad-sources
                         :card-id     (:id card)})))
    ;; fixtures = card's raw boundary tables + slice's leaf deps.
    (let [card-fixtures  (into #{} (map (fn [tid] {:table tid})) boundary-table-ids)
          chain-fixtures (leaf-deps slice
                                    #(table-dependencies! (id->transform %))
                                    producer-of)]
      {:slice     slice
       :order     order
       :leaf-deps (set/union card-fixtures chain-fixtures)})))
