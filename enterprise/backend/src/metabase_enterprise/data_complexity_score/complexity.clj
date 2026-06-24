(ns metabase-enterprise.data-complexity-score.complexity
  "Computes the Data Complexity Score for the semantic layer across three catalogs:
    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)
    :metabot  — what the internal Metabot can surface, narrowed by a caller-supplied scope."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def formula-version
  "Bump when the scoring formula changes in a way that would break historical score comparisons.
  Weight changes, new/removed components, and rollup-affecting restructures count; pure-shape changes do not.
  Tunables in the fingerprint (`embedding-model`, `synonym-threshold`, `text-variant`, etc) don't need a bump.

  v2 added two new scored measures (`:collection-tree-size`, `:field-level-collisions`) which change
  the catalog total, so pre-v2 scores are not comparable."
  2)

(def format-version
  "Bump when the response shape changes in a way that breaks consumer parsing, even when scores are equivalent.

  v2 introduced the descriptive leaf shape (`{:value ...}`, no `:score`) and the descriptive-only
  `:metadata` grouping (no `:score`), plus a raft of new keys under `:size`/`:ambiguity`."
  2)

(def weights
  "Per-axis weights applied to raw measurements. Public because they're part of the scoring
  fingerprint — a tuning change must force a re-score and be visible to Snowplow consumers
  without bumping `formula-version`."
  {:entity                 10
   :name-collision         100
   :synonym-pair           50
   :field                  1
   :repeated-measure       2
   :collection-tree-size   1
   :field-level-collisions 5})

(def complexity-bands
  "Tree of rating bands mirroring [[score-catalog]]'s output.
  Each node's `:bands` rates that node's `:score`; `:components` follows the same nesting as the scored catalog."
  {:bands [{:rating "low"    :label "Low complexity"    :max 999}
           {:rating "medium" :label "Medium complexity" :max 9999}
           {:rating "high"   :label "High complexity"}]})

(def ^:private nil-rating {:rating nil :rating-label nil})

(defn- ->band-lookup
  "Bundle `bands` with a pre-built `:rating`→presentation `:lookup` for fast rating-by-score."
  [bands]
  {:bands  bands
   :lookup (u/for-map [{:keys [rating label]} bands]
             [rating {:rating rating :rating-label label}])})

(defn- compile-bands
  "Replace each node's `:bands` in the bands tree with a precomputed `:band-lookup`."
  [bands]
  (cond-> {}
    (:bands bands)
    (assoc :band-lookup (->band-lookup (:bands bands)))

    (:components bands)
    (assoc :components (update-vals (:components bands) compile-bands))))

(def ^:private compiled-bands
  (compile-bands complexity-bands))

(defn- rating-for-score
  "Look up `score`'s rating in a preprocessed `band-lookup`, or `nil-rating` when nothing matches."
  [{:keys [bands lookup]} score]
  (or (when (some? score)
        (some (fn [{:keys [rating max]}]
                (when (or (nil? max) (<= score max))
                  (lookup rating)))
              bands))
      nil-rating))

(defn- descriptive-leaf?
  "A descriptive (v2) leaf — carries `:value` and no `:score`. Left untouched by rating decoration
  so it never gains `:rating`/`:rating_label` keys."
  [node]
  (and (contains? node :value) (not (contains? node :score))))

(defn- decorate-with-ratings*
  "Walk a catalog `node` and the matching `bands` subtree in parallel, merging rating fields onto every node.
  Each node is rated against its own `:band-lookup`, or `nil-rating` when absent.
  Error leaves and descriptive leaves are left untouched (no rating keys). Children recurse along `:components`."
  [bands node]
  (if (or (:error node) (descriptive-leaf? node))
    node
    (let [decorated (merge node (rating-for-score (:band-lookup bands) (:score node)))]
      (cond-> decorated
        (:components node)
        (update :components
                (fn [components]
                  (reduce-kv (fn [m k child]
                               (assoc m k (decorate-with-ratings* (get-in bands [:components k])
                                                                  child)))
                             {}
                             components)))))))

;; TODO: also emit the rating onto Snowplow events so benchmark consumers can correlate the band
;; against the raw score without re-applying the bands.
(defn decorate-with-ratings
  "Decorate each catalog with rating fields per `complexity-bands`."
  [score]
  (let [decorate (partial decorate-with-ratings* compiled-bands)]
    (reduce #(u/update-if-exists %1 %2 decorate) score [:library :universe :metabot])))

(def synonym-similarity-threshold
  "Cosine-similarity cutoff for flagging two names as synonyms.

  Higher than semantic-search's retrieval cutoff (0.30) because scoring needs precision, not
  recall. Note that we typically will use a STS model which typically produces lower similarity scores.

  See https://linear.app/metabase/document/synonym-analysis-21-april-2026-31c8ce76eddb for background."
  0.80)

;;; ----------------------------------- enumeration -----------------------------------
;;;
(def ^:private ^:const in-clause-chunk-size
  "Cap on the number of table-ids we put into a single `IN (...)` query. PostgreSQL prepared
   statements top out at 65,535 parameters and we leave headroom for other clauses."
  50000)

(defn- table-fields
  "Return `{table-id [{:name :semantic-type :description} ...]}` for active fields on `table-ids`.
  One extra query per scoring run, batched by `in-clause-chunk-size`. The per-field detail powers
  the v2 measures (`:field-level-collisions`, `:field-description-coverage`, `:semantic-type-coverage`)
  and the field count is just `(count fields)` — no separate aggregate scan needed."
  [table-ids]
  (->> (mapcat (fn [chunk]
                 (t2/query {:select [:table_id :name :semantic_type :description]
                            :from   [:metabase_field]
                            :where  [:and
                                     [:= :active true]
                                     [:in :table_id chunk]]}))
               (partition-all in-clause-chunk-size table-ids))
       (reduce (fn [acc {:keys [table_id name semantic_type description]}]
                 (update acc table_id (fnil conj [])
                         {:name name :semantic-type semantic_type :description description}))
               {})))

(defn- table-measure-names
  "Return `{table-id [measure-name ...]}` for non-archived Measures on the given `table-ids`.
  A measure is a named MBQL aggregation attached to a Table — see [[metabase.measures.models.measure]]."
  [table-ids]
  (into {}
        (mapcat (fn [chunk]
                  (u/group-by :table_id :name
                              (t2/select [:model/Measure :table_id :name]
                                         :archived false
                                         :table_id [:in chunk]))))
        (partition-all in-clause-chunk-size table-ids)))

(defn- ->card-entity
  "Shape a Card row into an entity map for scoring. Cards don't contribute to `:field-count` —
   the +1-per-field rule is about physical Table fields, not Card result columns — so we can skip
   the fat `result_metadata` column entirely and `:fields` is always empty. Measures are a separate
   first-class model tied to Tables, not Cards, so Cards also don't contribute to `:measure-names`.
   `:description` feeds the v2 `:description-coverage`/`:description-quality` measures."
  [{:keys [id name type description]}]
  {:id            id
   :name          name
   :kind          (keyword type)
   :description   description
   :field-count   0
   :fields        []
   :measure-names []})

(defn- ->table-entity [fields-by-table measure-names {:keys [id name description]}]
  (let [fields (get fields-by-table id [])]
    {:id            id
     :name          name
     :kind          :table
     :description   description
     :field-count   (count fields)
     :fields        fields
     :measure-names (get measure-names id [])}))

(defn- library-collection-ids
  "Set of collection IDs that make up the Library (root + descendants). Empty when the instance has no Library yet."
  []
  (into #{}
        (when-let [root (collections/library-collection)]
          ;; This is cheaper and less brittle than referencing the collection type constants for every entity type.
          (cons (:id root) (collections/descendant-ids root)))))

(defn- universe-collection-count
  "Count of non-archived, non-personal collections — the `:universe` (and metabot-fallback) scope's
  collection-tree size."
  ^long []
  (t2/count :model/Collection :archived false :personal_owner_id nil))

(defn- metabot-collection-scope-ids
  "Set of collection IDs the internal Metabot can see — its `collection_id` plus descendants.
   nil when no collection scope is configured (Metabot retrieves from everywhere). If the
   collection row can't be loaded (stale/invalid id) we still return a singleton set with the
   raw id so the catalog matches `metabot-metrics-and-models-query`, which filters on the raw
   `collection_id` and returns an empty result rather than dropping the filter."
  [collection-id]
  (when collection-id
    (into #{collection-id}
          (when-let [root (t2/select-one :model/Collection :id collection-id)]
            (collections/descendant-ids root)))))

(defn- verified-card-id-set
  "Set of Card ids whose most-recent moderation review is `verified`. Called only when
   `metabot-scope` requests verified-only filtering — avoids a `moderation_review` join on the
   universe Card select by pushing the check into a small auxiliary lookup."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(defn- routed-child-database-id-set
  "Set of database ids whose `router_database_id` is non-nil — the routed child databases whose
   tables Metabot/search hide. Tables with `:db_id` in this set are excluded from the `:metabot`
   catalog, mirroring the table-visibility rule in `metabase.warehouse-schema.models.table`."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(defn- pick-by-row
  "Filter `entities` by `row-pred` applied to the correspondingly-indexed `rows`. Preserves
   reference identity on the kept entity maps so library/metabot vectors share map instances
   with the universe vector rather than allocating fresh ones.
   A nil `row-pred` short-circuits to `[]` — callers whose filter is statically empty (e.g. no
   Library collections on this instance) pass nil to skip enumeration entirely."
  [row-pred rows entities]
  (if row-pred
    (into []
          (keep-indexed (fn [i row] (when (row-pred row) (nth entities i))))
          rows)
    []))

(defn- enumerate-catalogs
  "One-pass enumeration of all three scoring catalogs. Returns
   `{:library [...] :universe [...] :metabot [...] :collection-counts {...}}` where entity maps are
   shared *by reference* across catalogs — a Card or Table that appears in more than one catalog is
   one map in memory, not three. `:collection-counts` is the per-catalog `{:library :universe
   :metabot}` collection-tree size threaded into scoring as `ctx`.

   An earlier revision fetched the three catalogs separately, which duplicated DB work up to 3×
   per scoring run — most expensively on [[table-fields]] and [[table-measure-names]], each a scan
   over `metabase_field` / `measure`. We now fetch the universe superset once and derive the
   `:library` and `:metabot` subsets by in-memory filter, which collapses the DB round-trips and
   lets the aggregates run once each.

   `metabot-scope` is `{:verified-only? <bool> :collection-id <nil|Long>}` describing how the
   internal Metabot narrows its Cards further — it only adds filters, never widens. The caller
   owns the scope decision (premium-feature gate + Metabot row lookup); this namespace does not
   read settings, premium-feature gates, or Metabot rows directly."
  [{:keys [verified-only? collection-id]}]
  (let [library-cids      (library-collection-ids)
        metabot-cids      (metabot-collection-scope-ids collection-id)
        verified-ids      (when verified-only? (verified-card-id-set))
        routed-db-ids     (routed-child-database-id-set)
        ;; Extra columns (`:collection_id`, `:is_published`, `:visibility_type`, `:db_id`) are
        ;; selected purely to drive the in-memory library/metabot derivations below — they're
        ;; ignored by `->card-entity` / `->table-entity`. `:card_schema` is required by
        ;; `:model/Card`'s post-select hooks even when we don't otherwise use it.
        universe-cards    (t2/select [:model/Card :id :name :type :description :collection_id :card_schema]
                                     :type        [:in ["metric" "model"]]
                                     :archived    false
                                     :database_id [:not= audit/audit-db-id])
        universe-tables   (t2/select [:model/Table :id :name :description :collection_id :is_published
                                      :visibility_type :db_id]
                                     :active true
                                     :db_id  [:not= audit/audit-db-id])
        fields-by-table   (table-fields        (mapv :id universe-tables))
        measure-names     (table-measure-names (mapv :id universe-tables))
        card-entities     (mapv ->card-entity universe-cards)
        table-entities    (mapv #(->table-entity fields-by-table measure-names %) universe-tables)
        universe-coll-n   (universe-collection-count)
        collection-counts {:library  (count library-cids)
                           ;; metabot scopes its collection tree when a scope is set, else falls
                           ;; back to the universe collection count (it can retrieve everywhere).
                           :metabot  (if metabot-cids (count metabot-cids) universe-coll-n)
                           :universe universe-coll-n}
        in-library-card?  (when (seq library-cids)
                            (fn [{:keys [collection_id]}]
                              (contains? library-cids collection_id)))
        in-library-table? (when (seq library-cids)
                            (fn [{:keys [collection_id is_published]}]
                              (and is_published
                                   (contains? library-cids collection_id))))
        in-metabot-card?  (when (and (or (nil? metabot-cids) (seq metabot-cids))
                                     (or (not verified-only?) (seq verified-ids)))
                            (fn [{:keys [collection_id id]}]
                              (and (or (nil? metabot-cids)
                                       (contains? metabot-cids collection_id))
                                   (or (not verified-only?)
                                       (contains? verified-ids id)))))
        in-metabot-table? (fn [{:keys [visibility_type db_id]}]
                            (and (nil? visibility_type)
                                 (not (contains? routed-db-ids db_id))))]
    {:universe          (into card-entities table-entities)
     :library           (into (pick-by-row in-library-card?  universe-cards  card-entities)
                              (pick-by-row in-library-table? universe-tables table-entities))
     :metabot           (into (pick-by-row in-metabot-card?  universe-cards  card-entities)
                              (pick-by-row in-metabot-table? universe-tables table-entities))
     :collection-counts collection-counts}))

;;; ------------------------------------- scoring -------------------------------------

;;; ---------------------------------- leaf builders ----------------------------------

(defn- scored-leaf
  "Scored leaf map: raw `:measurement` (double — future-proofs non-integer axes like density) and
  weighted `:score` using the weight at `weight-key`."
  [weight-key n]
  {:measurement (double n)
   :score       (* n (get weights weight-key))})

(defn- value-leaf
  "Descriptive leaf — carries a raw `:value` (number, map, or nil) and NO `:score`, so it is skipped
  by the rollup. `:value` nil means \"not available\" (e.g. a ratio with a zero denominator), which
  consumers should render distinctly from 0."
  [v]
  {:value v})

(defn- safe-ratio
  "`num/denom` as a double, or nil when `denom` is zero (undefined, not 0). Both default to 0 if nil."
  [num denom]
  (let [num   (or num 0)
        denom (or denom 0)]
    (when-not (zero? denom)
      (double (/ num denom)))))

(defn- repeated-names
  "Count of name occurrences past the first (normalized for comparison). Single pass, no
   intermediate frequency map. `raw-names` may contain nils — they're skipped."
  [raw-names]
  (second
   (reduce (fn [[seen repeats] raw-name]
             (if-let [n-name (embedders/normalize-name raw-name)]
               (if (contains? seen n-name)
                 [seen (inc repeats)]
                 [(conj seen n-name) repeats])
               [seen repeats]))
           [#{} 0]
           raw-names)))

;;; ----------------------------------- :size measures --------------------------------

(defn- total-field-count ^long [entities]
  (reduce + 0 (keep :field-count entities)))

(defn- score-entity-count [entities]
  (scored-leaf :entity (count entities)))

(defn- score-field-count [total-fields]
  (scored-leaf :field total-fields))

(defn- score-collection-tree-size
  "Scored: number of collections in the catalog scope (from ctx). Missing → 0 (graceful)."
  [collection-count]
  (scored-leaf :collection-tree-size (or collection-count 0)))

(defn- fields-per-entity
  "Descriptive: field-count / entity-count. nil when there are no entities."
  [n total-fields]
  (value-leaf (safe-ratio total-fields n)))

(defn- measure-to-dim-ratio
  "Descriptive: `(named-measures + metric-cards) / fields` — how densely the catalog is curated as a
  semantic layer vs. thin wrappers over raw data. nil when there are no fields."
  [entities total-fields]
  (let [measures     (reduce + 0 (map #(count (:measure-names %)) entities))
        metric-cards (count (filter #(= :metric (:kind %)) entities))]
    (value-leaf (safe-ratio (+ measures metric-cards) total-fields))))

;;; ------------------------------- :ambiguity measures -------------------------------

(defn- score-name-collisions [entities]
  (scored-leaf :name-collision (repeated-names (map :name entities))))

(defn- score-repeated-measures [entities]
  (scored-leaf :repeated-measure (repeated-names (mapcat :measure-names entities))))

(defn- score-field-level-collisions
  "Scored: count of distinct normalized field names appearing on more than one distinct table.
  Only scans `:fields` on entities (Cards' `:fields` are empty). Degrades to 0 when no entity
  carries `:fields` (e.g. the representation path)."
  [entities]
  (let [name->tables (reduce (fn [acc e]
                               (reduce (fn [acc f]
                                         (if-let [n (embedders/normalize-name (:name f))]
                                           (update acc n (fnil conj #{}) (:id e))
                                           acc))
                                       acc
                                       (:fields e)))
                             {}
                             entities)
        collisions   (count (filter (fn [[_ tables]] (> (count tables) 1)) name->tables))]
    (scored-leaf :field-level-collisions collisions)))

(defn- name-collisions-density
  "Descriptive: collisions per 100 entities. nil when the catalog is empty."
  [entities]
  (let [collisions (repeated-names (map :name entities))]
    (value-leaf (some-> (safe-ratio collisions (count entities)) (* 100.0)))))

(defn- name-concentration
  "Descriptive: `1 - Pielou's evenness` over entity-name frequencies. 0 = perfectly even (all names
  unique); approaching 1 = highly concentrated. nil when there are no named entities; 0.0 when a
  single name category exists (evenness is trivially 1)."
  [entities]
  (let [freqs (->> entities (keep (comp embedders/normalize-name :name)) frequencies)
        total (reduce + 0 (vals freqs))
        s     (count freqs)]
    (cond
      (zero? total) (value-leaf nil)
      (<= s 1)      (value-leaf 0.0)
      :else
      (let [log-s (Math/log s)
            h     (reduce (fn [acc c]
                            (let [p (/ (double c) total)]
                              (- acc (* p (Math/log p)))))
                          0.0
                          (vals freqs))
            j     (/ h log-s)]
        (value-leaf (max 0.0 (min 1.0 (- 1.0 j))))))))

;;; ------------------------------- synonym graph math --------------------------------

(defn- dot ^double [^floats a ^floats b]
  (let [len (alength a)]
    (loop [i 0 acc 0.0]
      (if (< i len)
        (recur (inc i) (+ acc (* (aget a i) (aget b i))))
        acc))))

(defn- edge?
  "Squared-inequality form of `cosine(a,b) ≥ t` — avoids two `Math/sqrt` calls a direct cosine
  computation would need. Guards against a negative `a·b` flipping the sign when squared.
  `norms-product` is `‖a‖² · ‖b‖²` precomputed by the caller."
  [^floats a ^floats b ^double norms-product ^double threshold-sq]
  (and (pos? norms-product)
       (let [d (dot a b)]
         (and (>= d 0.0)
              (>= (* d d) (* threshold-sq norms-product))))))

(defn- build-adjacency
  "Return `{:adj ^objects (of #{j...}) :edges <long> :n <long>}` for the vector array `vecs` at
  `threshold`. Upper triangle only; each vector's `‖v‖²` is precomputed once."
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
    {:adj adj :edges @edges :n n}))

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

(defn- clustering-coefficient
  "Global clustering coefficient: `3·triangles / connected-triples`. nil when there are no triples."
  [^objects adj ^long n]
  (let [triangles (atom 0)
        triples   (atom 0)]
    (dotimes [i n]
      (let [nbs (aget adj i)
            d   (count nbs)]
        (when (>= d 2)
          (swap! triples + (/ (* d (dec d)) 2))
          (doseq [a nbs
                  b nbs
                  :when (and (< (long a) (long b))
                             (contains? (aget adj (long a)) (long b)))]
            (swap! triangles inc)))))
    (let [triples-total (long @triples)
          triangles-t3  (long @triangles)]
      (when (pos? triples-total)
        ;; Each triangle counted 3× above (once per vertex); triples counted once.
        (double (/ triangles-t3 triples-total))))))

(defn- degree-summary
  "`{:p50 :p90 :max}` over degrees on `adj`. Callers route n=0/n=1 elsewhere, so `n ≥ 2` here."
  [^objects adj ^long n]
  (let [degrees (vec (sort (mapv #(count (aget adj %)) (range n))))]
    {:p50 (nth degrees (quot n 2))
     :p90 (nth degrees (min (dec n) (quot (* n 9) 10)))
     :max (nth degrees (dec n))}))

(defn embedder-result
  "Invoke `embedder` once and return `{:name->vec <map>}` or `{:error <string>}`. Centralized so the
  metadata dim's `:embedding-coverage` can reuse the same lookup and the embedder runs once per
  catalog. Coerces the error string so an exception with a nil/blank message still produces a
  non-blank `:error` (otherwise an embedder outage would be indistinguishable from a real zero)."
  [entities embedder]
  (if-not embedder
    {:name->vec {}}
    (try
      {:name->vec (or (embedder entities) {})}
      (catch Throwable t
        (log/warn t "Complexity score: synonym detection failed; cascading nil through aggregates")
        {:error (or (some-> (.getMessage t) str/trim not-empty)
                    (.getName (class t)))}))))

(defn- entity-vectors
  "Materialize the name → vector lookup into a deterministic array of float arrays, deduping
  normalized names and dropping those with no embedding."
  ^objects [entities name->vec]
  (into-array Object
              (into []
                    (comp (keep (comp embedders/normalize-name :name))
                          (distinct)
                          (keep #(get name->vec %)))
                    entities)))

(defn- synonym-block
  "Build the `:ambiguity` synonym variables (scored `:synonym-pairs` + 7 descriptive analytics) from
  one adjacency graph. `embedder-out` is the already-invoked [[embedder-result]] so the lookup is
  shared with `:embedding-coverage`.

  On embedder error, `:synonym-pairs` carries `{:error ... :score nil}` so the nil cascades through
  `:ambiguity` → catalog total (visibly distinct from a real zero). n=0 (no embedded names) and n=1
  (singleton) get the well-defined degenerate values (nil vs 0.0 ratios)."
  [entities {:keys [name->vec error]}]
  (cond
    error
    {:synonym-pairs             {:value nil :score nil :error error}
     :synonym-edge-density      (value-leaf nil)
     :synonym-components        (value-leaf 0)
     :synonym-largest-component (value-leaf 0)
     :synonym-avg-component     (value-leaf nil)
     :synonym-clustering-coef   (value-leaf nil)
     :synonym-avg-degree        (value-leaf nil)
     :synonym-degree-summary    (value-leaf {:p50 0 :p90 0 :max 0})}

    :else
    (let [vecs (entity-vectors entities name->vec)
          n    (alength vecs)]
      (cond
        (zero? n)
        {:synonym-pairs             (scored-leaf :synonym-pair 0)
         :synonym-edge-density      (value-leaf nil)
         :synonym-components        (value-leaf 0)
         :synonym-largest-component (value-leaf 0)
         :synonym-avg-component     (value-leaf nil)
         :synonym-clustering-coef   (value-leaf nil)
         :synonym-avg-degree        (value-leaf nil)
         :synonym-degree-summary    (value-leaf {:p50 0 :p90 0 :max 0})}

        (= 1 n)
        {:synonym-pairs             (scored-leaf :synonym-pair 0)
         :synonym-edge-density      (value-leaf 0.0)
         :synonym-components        (value-leaf 1)
         :synonym-largest-component (value-leaf 1)
         :synonym-avg-component     (value-leaf nil)
         :synonym-clustering-coef   (value-leaf nil)
         :synonym-avg-degree        (value-leaf 0.0)
         :synonym-degree-summary    (value-leaf {:p50 0 :p90 0 :max 0})}

        :else
        (let [{:keys [^objects adj edges]} (build-adjacency vecs synonym-similarity-threshold)
              comps          (union-find-components adj n)
              multi          (filter #(>= (long %) 2) comps)
              largest        (if (seq comps) (apply max comps) 0)
              avg-comp       (when (seq multi)
                               (double (/ (reduce + 0 multi) (count multi))))
              ;; Graph density: edges as a fraction of the n·(n-1)/2 possible undirected edges,
              ;; so the value stays in [0,100] (a complete graph = 100%). n ≥ 2 here, so the
              ;; denominator is ≥ 1.
              possible-edges (/ (* n (dec n)) 2)]
          {:synonym-pairs             (scored-leaf :synonym-pair edges)
           :synonym-edge-density      (value-leaf (* 100.0 (/ (double ^long edges) (double possible-edges))))
           :synonym-components        (value-leaf (count comps))
           :synonym-largest-component (value-leaf largest)
           :synonym-avg-component     (value-leaf avg-comp)
           :synonym-clustering-coef   (value-leaf (clustering-coefficient adj n))
           :synonym-avg-degree        (value-leaf (double (/ (* 2.0 ^long edges) (double n))))
           :synonym-degree-summary    (value-leaf (degree-summary adj n))})))))

(defn- embedding-coverage
  "Fraction of distinct normalized names with an embedding in `name->vec` (in [0,1]). nil when there
  are no named entities, or when the embedder errored."
  [entities {:keys [name->vec error]}]
  (when-not error
    (let [names-set (into #{} (keep (comp embedders/normalize-name :name)) entities)
          covered   (count (filter #(contains? name->vec %) names-set))]
      (safe-ratio covered (count names-set)))))

;;; ------------------------------- :metadata measures --------------------------------

(def ^:private ^:const description-min-chars
  "Minimum trimmed length for an entity description to count as present — defends against one-word
  placeholders gaming the coverage metric."
  20)

(defn- non-empty-str? [s]
  (and (string? s) (pos? (count (str/trim s)))))

(defn- has-description? [s]
  (and (string? s) (>= (count (str/trim s)) description-min-chars)))

(defn- all-fields [entities]
  (mapcat :fields entities))

(defn- description-quality
  "Descriptive: p50 word count over non-empty entity descriptions. nil when none."
  [entities]
  (let [words (->> entities
                   (map :description)
                   (filter non-empty-str?)
                   (map #(count (str/split (str/trim %) #"\s+"))))]
    (value-leaf (when (seq words)
                  (let [sorted (vec (sort words))]
                    (nth sorted (quot (count sorted) 2)))))))

;;; -------------------------------- tree assembly ------------------------------------

(def ^:private default-level
  "Level used when a caller omits `:level` — compute everything, so existing callers/tests are
  unaffected by the cost-tiering gate. Callers that read the setting pass an already-clamped level."
  2)

(defn- score-tree-leaves
  "Pure: build the leaves tree of sub-score maps for one catalog. Scored leaves carry `:score`;
  descriptive leaves carry only `:value`. The surrounding shape defines the `:size`/`:ambiguity`/
  `:metadata` groupings that [[score-catalog]] rolls up. `:metadata` is descriptive-only, so it
  ends up with no `:score` and is excluded from the catalog total.

  Cost-tiered by `:level` (default [[default-level]]): level ≥ 1 computes the cheap DB-only measures
  (scale, nominal, metadata coverage minus embedding-coverage); level ≥ 2 ALSO invokes the embedder
  and adds the synonym graph (`:synonym-pairs` + the 7 `synonym-*` analytics) and
  `:embedding-coverage`. At level 1 those keys are OMITTED entirely (not emitted as zero leaves).

  Gracefully degrades on the offline/representation path: entities missing `:fields`/`:description`
  yield 0 / nil rather than throwing, and a nil `:collection-count` scores `collection-tree-size` 0."
  [entities {:keys [collection-count level] :or {level default-level}} embedder]
  (let [n            (count entities)
        total-fields (total-field-count entities)
        ;; Only invoke the embedder at level ≥ 2 — at level 1 the synonym/embedding work is skipped
        ;; entirely, so we never pay for it.
        emb          (when (>= level 2) (embedder-result entities embedder))
        fields       (all-fields entities)
        tables       (filter #(= :table (:kind %)) entities)]
    {:size      {:entity-count         (score-entity-count entities)
                 :field-count          (score-field-count total-fields)
                 :collection-tree-size (score-collection-tree-size collection-count)
                 :fields-per-entity    (fields-per-entity n total-fields)
                 :measure-to-dim-ratio (measure-to-dim-ratio entities total-fields)}
     :ambiguity (cond-> {:name-collisions         (score-name-collisions entities)
                         :repeated-measures       (score-repeated-measures entities)
                         :field-level-collisions  (score-field-level-collisions entities)
                         :name-collisions-density (name-collisions-density entities)
                         :name-concentration      (name-concentration entities)}
                  (>= level 2) (merge (synonym-block entities emb)))
     :metadata  (cond-> {:description-coverage       (value-leaf (safe-ratio (count (filter #(has-description? (:description %)) entities))
                                                                             n))
                         :field-description-coverage (value-leaf (safe-ratio (count (filter #(non-empty-str? (:description %)) fields))
                                                                             (count fields)))
                         :semantic-type-coverage     (value-leaf (safe-ratio (count (filter :semantic-type fields))
                                                                             (count fields)))
                         :curated-metric-coverage    (value-leaf (safe-ratio (count (filter #(seq (:measure-names %)) tables))
                                                                             (count tables)))
                         :description-quality        (description-quality entities)}
                  ;; embedding-coverage reuses the embedder result, so it's a level-2 measure too.
                  (>= level 2) (assoc :embedding-coverage (value-leaf (embedding-coverage entities emb))))}))

(defn- leaf?
  "A node is a leaf when it carries `:measurement`, `:value`, or `:error` — i.e. it is not an
  internal grouping. Internal nodes are recursed into via their values."
  [node]
  (or (contains? node :measurement)
      (contains? node :value)
      (contains? node :error)))

(defn- nil-safe-sum
  "Sum `xs` (numbers and/or nils). Returns nil if any element is nil — used to cascade an
   uncomputed sub-score through aggregates instead of silently low-biasing the total with zeros."
  [xs]
  (when (every? some? xs)
    (reduce + xs)))

(defn- rollup-node
  "Recursively roll up a node's children into `{:score <sum> :components {...}}`.
  Leaves pass through unchanged. A node's `:score` is the sum of `:score` over the children that
  HAVE a `:score` key (descriptive leaves/groupings are skipped). A node with ZERO scored
  descendants gets NO `:score` key — it is a descriptive grouping (e.g. `:metadata`), so it drops
  out of the catalog total. The nil cascade still applies within the scored set: an errored scored
  leaf's `:score nil` nils its parent."
  [node]
  (if (leaf? node)
    node
    (let [components    (update-vals node rollup-node)
          scored-vals   (->> components vals (filter #(contains? % :score)) (map :score))
          base          {:components components}]
      (if (seq scored-vals)
        (assoc base :score (nil-safe-sum scored-vals))
        base))))

(defn score-catalog
  "Pure: compute the score breakdown for a catalog given its `entities`, a `ctx`
  (`{:collection-count <long|nil> :level <0..2>}`), and an optional `embedder`. Returns
  `{:score <sum> :components {:size {...} :ambiguity {...} :metadata {...}}}`; see
  [[score-tree-leaves]] for the leaf layout. `:metadata` carries no `:score` (descriptive-only).

  At level 0 the catalog node is `{:components {}}` (no `:score`) — scoring is skipped entirely and
  the embedder is never invoked. `:level` defaults to [[default-level]] when absent."
  [entities {:keys [level] :or {level default-level} :as ctx} embedder]
  (if (zero? level)
    {:components {}}
    (rollup-node (score-tree-leaves entities ctx embedder))))

;;; ----------------------------------- public API ------------------------------------

(defn- snake ^String [x]
  (str/replace (name x) "-" "_"))

(defn- dotted-key
  "Join `parts` with `.` after snake-casing each. `(dotted-key :size :entity-count)` → `\"size.entity_count\"`."
  [& parts]
  (str/join "." (map snake parts)))

(defn- snake-keys
  "Walk maps recursively, snake-casing keyword keys and keyword leaf values to strings.
  Sequential collections aren't traversed — current callers (`weights`, `embedding-model`) only
  pass maps. Sorted-map output keeps the JSON serialization stable."
  [x]
  (cond
    (map? x)     (into (sorted-map) (map (fn [[k v]] [(snake k) (snake-keys v)])) x)
    (keyword? x) (snake x)
    :else        x))

(defn- parameters-map
  "Sorted-map of scoring inputs likely to evolve, published as a JSON object on each event."
  [{:keys [synonym-threshold embedding-model text-variant weights level]}]
  (cond-> (sorted-map "synonym_threshold" synonym-threshold
                      "weights"           (snake-keys weights))
    (some? level)   (assoc "level"           level)
    embedding-model (assoc "embedding_model" (snake-keys embedding-model))
    text-variant    (assoc "text_variant"    (snake text-variant))))

(def ^:private max-error-length
  "Matches the Snowplow schema's `error` maxLength — a pathological exception message
  must not fail validation and drop the whole event."
  1024)

(defn- truncate-error [s]
  (cond-> s (< max-error-length (count s)) (subs 0 max-error-length)))

(defn- with-score
  "Attach `:score` to `event` only when it is non-nil.
  The `data_complexity` Snowplow schema flags `score` as non-nullable but optional, so an
  uncomputed sub-score (or a rollup that cascaded nil from one) must omit the key entirely
  rather than emit `\"score\": null`."
  [event score]
  (cond-> event (some? score) (assoc :score score)))

(defn- measurement-of
  "The numeric measurement to publish for a leaf: a scored leaf's `:measurement`, or a descriptive
  leaf's `:value` when (and only when) it is a number. Descriptive map/nil values (e.g.
  `:synonym-degree-summary`) emit no `:measurement` — the Snowplow schema's `measurement` is a
  single number, not a structure."
  [node]
  (cond
    (:measurement node)        (:measurement node)
    (number? (:value node))    (:value node)))

(defn- node->events
  "Walk one catalog and emit a Snowplow event per node.
  Computed leaves use a `<path>` key and carry `:measurement`; error leaves use the same `<path>` key with `:error`.
  Internal nodes use a `<path>.total` key with the rolled-up `:score` (the root emits as `total`).
  `:score` is omitted when nil or absent (descriptive leaves/groupings); see [[with-score]]."
  [base catalog path node]
  (let [;; `:total` here is the Snowplow wire-format suffix for rollup nodes, not an in-memory field.
        key   (apply dotted-key (if (:components node) (conj path :total) path))
        m     (measurement-of node)
        event (cond-> (-> base
                          (assoc :catalog catalog :key key)
                          (with-score (:score node)))
                (some? m)     (assoc :measurement m)
                (:error node) (assoc :error (truncate-error (:error node))))]
    (cons event
          (mapcat (fn [[k child]] (node->events base catalog (conj path k) child))
                  (:components node)))))

(defn- emit-snowplow!
  "Submits Snowplow events for every score, every group aggregation, and the grand total.
  Returns true when they are all successfully delivered.
  Returns false when tracking is disabled or any emission failed."
  [{:keys [library universe metabot meta]}]
  ;; TODO (Chris 2026-06-02) -- add an optional `computed_at` field to the data_complexity Snowplow schema
  ;; (1-0-1) and emit it, sourced from (:calculated-at meta) on the re-publish path and from compute-time
  ;; `now` on the fresh path.
  ;; Until then a re-published cached score (see [[republish-score!]]) is dated by Snowplow's collector
  ;; ingest time, overstating freshness by up to the cron cooldown window (12h).
  (let [base   {:event           :data_complexity_scoring
                :batch_id        (str (random-uuid))
                :formula_version (:formula-version meta)
                :parameters      (parameters-map meta)}
        events (mapcat (fn [[catalog result]] (node->events base catalog [] result))
                       [[:library library] [:universe universe] [:metabot metabot]])]
    ;; No short-circuiting - even if they are failures, attempt the rest.
    (reduce (fn [all-ok? event]
              (and (analytics/track-event! :snowplow/data_complexity event) all-ok?))
            ;; Since events cannot be empty, we don't need to worry about returning a vacuous true.
            true
            events)))

(defn republish-score!
  "Re-emit an already-computed `score` map to Snowplow without recomputing — for retrying a publish
  that failed after the snapshot was already persisted. Returns the score carrying
  `::snowplow-published?` metadata, mirroring [[complexity-scores]] so callers share the
  `maybe-advance-last-fingerprint!` gate."
  [score]
  (with-meta score
             {::snowplow-published? (boolean (try
                                               (emit-snowplow! score)
                                               (catch Throwable t
                                                 (log/warn t "Failed to re-publish cached complexity score to Snowplow"))))}))

(defn score-from-entities
  "Pure: compute the full complexity score from pre-built entity vectors and an embedder. No DB
   access, no Snowplow emission — suitable for callers that have already loaded their entities
   from another source (e.g., a representation file).

   Options:
     `:embedding-model-meta` — `{:provider ... :model-name ...}` map embedded into the response's
        `:meta`, or nil to omit the key. Callers that know what embedding model they used should
        pass it so benchmark consumers can pin to it.
     `:metabot-entities` — when non-nil, scored separately as the `:metabot` catalog. When nil
        (default), we assume this means that metabot has no additional filtering configured, and
        reuse the `:universe` score. In the fallback case the response `:meta` includes
        `:metabot-source :universe-fallback` so benchmark consumers recognise this scenario.
     `:level` — cost-tier (0..2); defaults to [[default-level]] (2). See [[score-catalog]]."
  [library-entities universe-entities embedder {:keys [embedding-model-meta metabot-entities
                                                       collection-counts level]
                                                :or {level default-level}}]
  ;; Callers from the representation/CLI path omit collection counts entirely; default each catalog's
  ;; `:collection-count` to nil so `collection-tree-size` scores 0 and the size ratios degrade to nil
  ;; rather than throwing — keeps representation.clj / cli.clj working without per-catalog counts.
  (let [ctx-for            (fn [catalog] {:collection-count (get collection-counts catalog) :level level})
        universe-score     (score-catalog universe-entities (ctx-for :universe) embedder)
        metabot-fallback?  (nil? metabot-entities)]
    {:library  (score-catalog library-entities (ctx-for :library) embedder)
     :universe universe-score
     :metabot  (if metabot-fallback?
                 universe-score
                 (score-catalog metabot-entities (ctx-for :metabot) embedder))
     :meta     (cond-> {:formula-version   formula-version
                        :format-version    format-version
                        :synonym-threshold synonym-similarity-threshold
                        :level             level
                        :weights           weights}
                 embedding-model-meta (assoc :embedding-model embedding-model-meta)
                 metabot-fallback?    (assoc :metabot-source :universe-fallback))}))

(defn- time-phase!
  "Run `f`, record duration on the per-phase histogram labelled by `stage` and `catalog`, return its value."
  [stage catalog f]
  (let [timer (u/start-timer)]
    (try
      (f)
      (finally
        (analytics.interface/observe! :metabase-data-complexity/phase-duration-ms
                                      {:stage stage :catalog catalog}
                                      (u/since-ms timer))))))

(defn complexity-scores
  "Compute the complexity score for the `:library`, `:universe`, and `:metabot` catalogs of this
  Metabase instance.

  Returns a map of the shape:

      {:library  {:score n :components {...}}
       :universe {:score n :components {...}}
       :metabot  {:score n :components {...}}
       :meta     {:formula-version 2
                  :format-version 2
                  :synonym-threshold 0.80
                  :embedding-model {:provider ..., :model-name ..., :model-dimensions ...}
                  :text-variant :names-split}}

  Pure: this fn does not read settings or feature flags. Callers (api / task) resolve the
  synonym-axis source via [[metabase-enterprise.data-complexity-score.synonym-source]] and pass
  the result here.

  Options:
    `:embedder`             — synonym-axis embedder. `nil` (or unset) disables synonym scoring.
    `:embedding-model-meta` — `{:provider :model-name :model-dimensions}` published into
                              `:meta.embedding-model`. Pass nil to omit.
    `:text-variant`         — preprocessing variant published into `:meta.text-variant`. Pass nil
                              to omit (the search-index path passes nil because its preprocessing
                              isn't a single named variant).
    `:metabot-scope`        — `{:verified-only? <bool> :collection-id <nil|Long>}` describing how
                              the internal Metabot filters Cards.
    `:emit-snowplow?`       — whether to publish per-score Snowplow events. Defaults true.
    `:level`                — cost-tier (0..2) controlling how much detail to compute. The caller
                              passes an already-clamped [[settings/effective-level]]; this fn stays
                              pure and does not read the setting. Defaults to [[default-level]] (2)."
  [& {:keys [embedder embedding-model-meta text-variant metabot-scope emit-snowplow? level]
      :or {emit-snowplow? true level default-level}}]
  ;;; NOTE: we fully materialize vectors of the relevant entities.
  ;;; For very large instances that means holding large lists in memory, but each catalog is consumed
  ;;; by many sub-score functions that each walk the collection, so making this reducible would
  ;;; re-query the app-db five times per scoring call — a worse tradeoff than the bounded memory we
  ;;; currently consume.
  (let [total-timer (u/start-timer)]
    (try
      (let [{:keys [library universe metabot collection-counts]}
            ;; Single enumerate phase — see [[enumerate-catalogs]]. Library ⊆ universe and
            ;; metabot ⊆ universe, so fetching each catalog separately duplicated DB work; the
            ;; catalog label `"all"` on the enumerate stage reflects that one pass covers all
            ;; three. Per-catalog timing only applies to the pure scoring step.
            ;; `collection-counts` (nil when a caller stubs enumerate-catalogs without it) feeds each
            ;; catalog's `:collection-count` ctx; a missing count degrades `collection-tree-size` to 0.
            (time-phase! "enumerate" "all" #(enumerate-catalogs metabot-scope))
            ctx-for        (fn [catalog] {:collection-count (get collection-counts catalog) :level level})
            universe-score (time-phase! "score" "universe" #(score-catalog universe (ctx-for :universe) embedder))
            library-score  (time-phase! "score" "library"  #(score-catalog library  (ctx-for :library)  embedder))
            metabot-score  (time-phase! "score" "metabot"  #(score-catalog metabot  (ctx-for :metabot)  embedder))
            result         {:library  library-score
                            :universe universe-score
                            :metabot  metabot-score
                            :meta     (cond-> {:formula-version   formula-version
                                               :format-version    format-version
                                               :synonym-threshold synonym-similarity-threshold
                                               :level             level
                                               :weights           weights}
                                        embedding-model-meta (assoc :embedding-model embedding-model-meta)
                                        text-variant         (assoc :text-variant    text-variant))}
            ;; `emit-snowplow!` returns true only when every event reached the tracker (false when
            ;; Snowplow is disabled or any emission failed) — scheduler/boot callers gate
            ;; `data-complexity-scoring-last-fingerprint` on this so a disabled collector or any
            ;; partial failure doesn't silently mark the fingerprint as published.
            published?     (time-phase! "publish" "all"
                                        (fn []
                                          (boolean
                                           (when emit-snowplow?
                                             (try
                                               (emit-snowplow! result)
                                               (catch Throwable t
                                                 (log/warn t "Failed to publish complexity score to Snowplow")))))))]
        (with-meta result {::snowplow-published? published?}))
      (finally
        (analytics.interface/observe! :metabase-data-complexity/scoring-duration-ms
                                      (u/since-ms total-timer))))))

(comment
  (complexity-scores))
