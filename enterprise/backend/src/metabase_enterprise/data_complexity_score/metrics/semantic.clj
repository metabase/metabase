(ns metabase-enterprise.data-complexity-score.metrics.semantic
  "Semantic-disambiguation dimension — meaning-level overlap computed from embedded name vectors.
   Complements the nominal dimension: `Gross_Revenue` vs `Net_Sales` have zero nominal overlap
   but high semantic overlap, and an agent still has to choose between them.

   We build one adjacency graph G at similarity-threshold 0.90 (the per-instance precision cutoff
   calibrated in `test_resources/data_complexity_score/analysis/2026_04_21_data_analysis_summary.md`) and
   derive every variable from it in a single pass. Cost dominator is the O(N²) edge build; the
   graph-analytics passes are linear in |V|+|E|.

   Variables:
     :synonym-pairs              (scored)  edges on G
     :synonym-edge-density       (value)   |E| / |V| × 100
     :synonym-components         (value)   connected-component count (union-find)
     :synonym-largest-component  (value)   max component size
     :synonym-avg-component      (value)   mean size over components with ≥2 members
     :synonym-clustering-coef    (value)   3·triangles / connected-triples
     :synonym-avg-degree         (value)   2·|E| / |V|
     :synonym-degree-summary     (value)   {:p50 :p90 :max} degree distribution

   All tier 2."
  (:require
   [metabase-enterprise.data-complexity-score.metrics.common :as common]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:const synonym-similarity-threshold
  "Cosine similarity at or above which two entity names are flagged as synonyms. Deliberately
  higher than the semantic-search retrieval cutoff (0.30): search optimizes for recall (\"return
  anything plausibly relevant\") while the complexity score needs precision (\"these are
  confusingly similar\"). 0.90 was chosen by eyeballing sample pairs from the stats appdb at
  multiple thresholds — see
  `enterprise/backend/test_resources/data_complexity_score/analysis/2026_04_21_data_analysis_summary.md`
  for the calibration data."
  0.90)

(def weights
  "Per-variable weights contributing to the dimension sub-total."
  {:synonym-pairs 50})

;;; ---------------------------------- graph math ---------------------------------

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len)
        (recur (inc i) (+ acc (* (aget a i) (aget b i))))
        acc))))

(defn- edge?
  "Squared-inequality form of `cosine(a,b) ≥ t` — avoids two Math/sqrt calls a direct cosine
  computation would need. Guards against negative `a·b` flipping the sign when squared."
  [^floats a ^floats b ^double norms-product ^double threshold-sq]
  (and (pos? norms-product)
       (let [d (dot a b)]
         (and (>= d 0.0)
              (>= (* d d) (* threshold-sq norms-product))))))

(defn- build-adjacency
  "Return `{:adj ^objects (of #{j...}) :edges <long> :norms-sq ^doubles}` for the vector array
  `vecs` at `threshold`. Upper triangle only; each vector's `‖v‖²` precomputed once."
  [^objects vecs ^double threshold]
  (let [n            (alength vecs)
        threshold-sq (* threshold threshold)
        norms-sq     (double-array n)
        adj          (object-array n)
        edges        (atom 0)]
    (dotimes [i n]
      (let [^floats v (aget vecs i)]
        (aset norms-sq i (dot v v)))
      (aset adj i (transient #{})))
    (dotimes [i n]
      (loop [j (inc i)]
        (when (< j n)
          (when (edge? (aget vecs i) (aget vecs j)
                       (* (aget norms-sq i) (aget norms-sq j))
                       threshold-sq)
            (aset adj i (conj! ^clojure.lang.ITransientCollection (aget adj i) j))
            (aset adj j (conj! ^clojure.lang.ITransientCollection (aget adj j) i))
            (swap! edges inc))
          (recur (inc j)))))
    (dotimes [i n]
      (aset adj i (persistent! (aget adj i))))
    {:adj adj :edges @edges :norms-sq norms-sq :n n}))

;;; --------------------------------- components ----------------------------------

(defn- union-find-components
  "Connected components via iterative BFS over `adj`. Returns a vector of component sizes."
  [^objects adj ^long n]
  (let [visited (boolean-array n)
        sizes   (transient [])]
    (dotimes [start n]
      (when-not (aget visited start)
        (let [q    (java.util.ArrayDeque.)
              size (atom 0)]
          (.add q (int start))
          (aset visited start true)
          (while (not (.isEmpty q))
            (let [v (int (.poll q))]
              (swap! size inc)
              (doseq [nb (aget adj v)]
                (when-not (aget visited (long nb))
                  (aset visited (long nb) true)
                  (.add q (int nb))))))
          (conj! sizes @size))))
    (persistent! sizes)))

;;; ------------------------------- graph metrics ---------------------------------

(defn- clustering-coefficient
  "Global clustering coefficient: `3·triangles / connected-triples`.
   Returns nil when there are no triples (graph is a matching or smaller)."
  [^objects adj ^long n]
  (let [triangles (atom 0)
        triples   (atom 0)]
    (dotimes [i n]
      (let [nbs (aget adj i)
            d   (count nbs)]
        (when (>= d 2)
          ;; Triples centered at i: C(d, 2)
          (swap! triples + (/ (* d (dec d)) 2))
          ;; Triangles: pairs of neighbors that are themselves connected. Count each triangle
          ;; three times (once from each vertex) and divide at the end.
          (doseq [a nbs
                  b nbs
                  :when (and (< (long a) (long b))
                             (contains? (aget adj (long a)) (long b)))]
            (swap! triangles inc)))))
    (let [triples-total (long @triples)
          triangles-t3  (long @triangles)]
      (when (pos? triples-total)
        ;; Each triangle counted 3× above (once per vertex); triples counted once. So
        ;; 3·triangles / triples = triangles-t3 / triples.
        (double (/ triangles-t3 triples-total))))))

(defn- degree-summary
  "`{:p50 :p90 :max}` over degrees on `adj`."
  [^objects adj ^long n]
  (let [degrees (vec (sort (mapv #(count (aget adj %)) (range n))))]
    (if (zero? n)
      {:p50 0 :p90 0 :max 0}
      {:p50 (nth degrees (quot n 2))
       :p90 (nth degrees (min (dec n) (quot (* n 9) 10)))
       :max (nth degrees (dec n))})))

;;; --------------------------------- embedder ------------------------------------

(defn embedder-result
  "Invoke `embedder` and return `{:name->vec <map>}` or `{:error <string>}`. Centralized so the
  metadata dimension's `:embedding-coverage` variable can reuse the same lookup."
  [entities embedder]
  (if-not embedder
    {:name->vec {}}
    (try
      {:name->vec (or (embedder entities) {})}
      (catch Throwable t
        (log/warn t "Complexity score: synonym detection failed; falling back to 0")
        {:error (.getMessage t)}))))

(defn- entity-vectors
  "Materialize the name → vector lookup into a deterministic array of float arrays, deduping
   normalized names and dropping those with no embedding."
  ^objects [entities name->vec]
  (into-array Object
              (into []
                    (comp (keep (comp common/normalize-name :name))
                          (distinct)
                          (keep #(get name->vec %)))
                    entities)))

;;; ----------------------------- scoring entrypoint ------------------------------

(defn- empty-block
  "Zero-valued variable block used when the embedder yields nothing (level 1 or a failure).
  With no vertices there is nothing to form a component from, so component counts are 0 and the
  ratios are nil (undefined denominators)."
  [extra]
  (common/dimension-block
   (cond-> [[:synonym-pairs             (common/scored (:synonym-pairs weights) 0)]
            [:synonym-edge-density      (common/value nil)]
            [:synonym-components        (common/value 0)]
            [:synonym-largest-component (common/value 0)]
            [:synonym-avg-component     (common/value nil)]
            [:synonym-clustering-coef   (common/value nil)]
            [:synonym-avg-degree        (common/value nil)]
            [:synonym-degree-summary    (common/value {:p50 0 :p90 0 :max 0})]]
     extra (conj extra))))

(defn- singleton-block
  "Variable block for a one-vertex graph: one trivial component of size 1, no edges. The ratios
  are well-defined (0 edges / 1 vertex = 0), so unlike `empty-block` we emit 0.0 rather than nil
  for `edge-density` and `avg-degree`."
  []
  (common/dimension-block
   [[:synonym-pairs             (common/scored (:synonym-pairs weights) 0)]
    [:synonym-edge-density      (common/value 0.0)]
    [:synonym-components        (common/value 1)]
    [:synonym-largest-component (common/value 1)]
    [:synonym-avg-component     (common/value nil)]
    [:synonym-clustering-coef   (common/value nil)]
    [:synonym-avg-degree        (common/value 0.0)]
    [:synonym-degree-summary    (common/value {:p50 0 :p90 0 :max 0})]]))

(defn score
  "Compute the Semantic dimension block.
  `embedder-out` is the already-invoked embedder result (from `embedder-result`) — we take it
  pre-invoked so the orchestrator can share the lookup with the metadata dim's
  `:embedding-coverage` variable."
  [entities {:keys [name->vec error]}]
  (if error
    (update (empty-block nil) :variables
            assoc :synonym-pairs (assoc (common/scored (:synonym-pairs weights) 0)
                                        :error error))
    (let [vecs (entity-vectors entities name->vec)
          n    (alength vecs)]
      (cond
        (zero? n) (empty-block nil)
        (= 1 n)   (singleton-block)
        :else
        (let [{:keys [^objects adj edges]} (build-adjacency vecs synonym-similarity-threshold)
              comps                        (union-find-components adj n)
              multi                        (filter #(>= (long %) 2) comps)
              largest                      (if (seq comps) (apply max comps) 0)
              avg-comp                     (when (seq multi)
                                             (double (/ (reduce + 0 multi) (count multi))))
              edge-density                 (* 100.0 (/ (double ^long edges) (double n)))
              clustering                   (clustering-coefficient adj n)
              avg-degree                   (double (/ (* 2.0 ^long edges) (double n)))
              degrees                      (degree-summary adj n)]
          (common/dimension-block
           [[:synonym-pairs             (common/scored (:synonym-pairs weights) edges)]
            [:synonym-edge-density      (common/value edge-density)]
            [:synonym-components        (common/value (count comps))]
            [:synonym-largest-component (common/value largest)]
            [:synonym-avg-component     (common/value avg-comp)]
            [:synonym-clustering-coef   (common/value clustering)]
            [:synonym-avg-degree        (common/value avg-degree)]
            [:synonym-degree-summary    (common/value degrees)]]))))))

(defn embedding-coverage
  "Fraction of distinct normalized names on `entities` that have an embedding in `name->vec`.
   Clamped to [0, 1]: an embedder file may contain vectors for names not in this catalog (e.g. a
   fixture covers both library + universe), so we only count names that are actually present.
   nil when there are no named entities."
  [entities {:keys [name->vec error]}]
  (when-not error
    (let [names-set (into #{} (keep (comp common/normalize-name :name)) entities)
          covered   (count (filter #(contains? name->vec %) names-set))]
      (common/safe-ratio covered (count names-set)))))

(comment
  ;; REPL smoke test
  (score [{:name "a"} {:name "b"}] {:name->vec {}}))
