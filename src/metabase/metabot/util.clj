(ns metabase.metabot.util
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- safe-case-updater
  [f]
  #(cond-> % (or (string? %) (keyword? %)) f))

(def safe->kebab-case-en
  "Convert strings or keywords to kebab-case."
  (safe-case-updater u/->kebab-case-en))

(def safe->snake_case_en
  "Convert strings or keywords to snake_case"
  (safe-case-updater u/->snake_case_en))

(defn recursive-update-keys
  "Recursively convert map keys in `form` with `f`."
  [form f]
  (walk/walk #(cond-> % (coll? %) (recursive-update-keys f))
             #(cond-> % (map? %) (update-keys f))
             form))

;;; MBQL utils (needed until we erradicate legacy from Metabot module)

(defn extract-sql-content
  "Extract SQL content from a dataset_query map.
  Handles both legacy format and lib/query format."
  [query]
  (or
   ;; Following should be ideally handled by lib functions. However we have test in place that checks this piece
   ;; is able to handle not-normalized mbql5 with e.g. string value for type. Lib functions throw on such input.
   ;;
   ;; Try lib/query format (with stages); stage 0 of a multi-stage query would be partial SQL, so fall through
   (when (= 1 (count (:stages query)))
     (get-in query [:stages 0 :native]))
   ;; Try legacy format
   (get-in query [:native :query])
   ;; orphaned sources skip normalization and keep their JSON string keys
   (when (= 1 (count (get query "stages")))
     (get-in query ["stages" 0 "native"]))
   (get-in query ["native" "query"])))

;;; ---------------------------------- Orphaned aggregation refs ----------------------------------
;;;
;;; An MBQL 5 aggregation is identified by the `:lib/uuid` in its options map; an
;;; `[:aggregation opts "<uuid>"]` ref in the same stage points at it by that uuid. Stripping
;;; `:lib/*` keys breaks that binding on one side only: the aggregation's uuid is a key and goes, the
;;; ref's copy is a value in slot 2 and stays. Normalizing then mints a fresh uuid for the
;;; aggregation, leaving the ref pointing at nothing, and the query fails both `->legacy-MBQL`
;;; conversion and QP normalization ("Invalid :aggregation reference: no aggregation with uuid ...").
;;;
;;; Legacy MBQL refs are positional (`[:aggregation 0]`), so this only affects queries arriving as
;;; MBQL 5 with their internal keys stripped, e.g. via the frontend's viewing context.

(defn- aggregation-ref?
  "True if `x` is an `[:aggregation {opts} \"<uuid>\"]` reference clause. Callers normalize first, so
  clause heads are keywords."
  [x]
  (and (vector? x)
       (= 3 (count x))
       (= :aggregation (nth x 0))
       (map? (nth x 1))
       (string? (nth x 2))))

(defn- orphan-ref-pred
  "Predicate matching aggregation refs in `stage` whose uuid none of its own aggregations carry."
  [stage]
  (let [uuids (into #{} (keep #(get-in % [1 :lib/uuid])) (:aggregation stage))]
    (every-pred aggregation-ref? #(not (uuids (nth % 2))))))

(defn- sole-aggregation-uuid
  "The `:lib/uuid` of `stage`'s only aggregation, or nil if it has zero or several. With several the
  ref's target is unrecoverable: nothing in the query records which one it named."
  [{aggs :aggregation}]
  (when (= 1 (count aggs))
    (get-in aggs [0 1 :lib/uuid])))

(defn- rebind-orphaned-refs
  "Point `stage`'s orphaned aggregation refs back at its own aggregation. Expects `:joins` already
  removed: a join's refs resolve against the join's aggregations, not this stage's.

  Ambiguous refs are left alone rather than guessed at, since a wrong rebind would silently change
  what the query computes."
  [stage]
  (let [orphan? (orphan-ref-pred stage)]
    (if-not (some orphan? (tree-seq coll? seq stage))
      stage
      (if-let [target (sole-aggregation-uuid stage)]
        (do
          ;; The route that stripped these (agent state round-tripping through the client) was
          ;; removed in #76939, so a repair here means a new source exists. Say so rather than
          ;; fixing it silently.
          (log/warn "Repaired an orphaned MBQL 5 aggregation reference; something upstream stripped this query's :lib/uuids")
          (walk/postwalk #(cond-> % (orphan? %) (assoc 2 target)) stage))
        (do
          (log/warnf (str "Cannot repair orphaned MBQL 5 aggregation reference: stage has %d aggregations, "
                          "so the intended target is ambiguous. The query will not convert to legacy MBQL.")
                     (count (:aggregation stage)))
          stage)))))

(declare repair-orphaned-aggregation-refs)

(defn- repair-stage
  "Repair `stage`'s own aggregation refs, then recurse into its joins."
  [stage]
  ;; A join's stages carry their own aggregations, so they are repaired separately: this stage's
  ;; uuids must not reach a join's refs.
  (let [joins (some->> (:joins stage) (mapv repair-orphaned-aggregation-refs))]
    (cond-> (rebind-orphaned-refs (dissoc stage :joins))
      joins (assoc :joins joins))))

(defn repair-orphaned-aggregation-refs
  "Rebind `[:aggregation opts \"<uuid>\"]` refs in `query` that name a uuid no aggregation in their
  stage carries, so the query converts and runs again. See the comment block above.

  `query` must already be normalized: an unnormalized one has no `:lib/uuid`s to bind to and is
  returned unchanged, as is any query with no orphaned refs. Joins and later stages are handled."
  [query]
  (cond-> query
    (seq (:stages query)) (update :stages (partial mapv repair-stage))))
