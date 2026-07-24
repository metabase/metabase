(ns metabase-enterprise.osi-generation.candidates
  "Candidate selection for the OSI generation loop.

  Input is the spec layer's membership plus ONE batched hydrate over the whole membership
  (`spec/hydrate` issues one query per hydration key, never one per entity — a per-entity hydrate is
  the one way this design gets expensive). Selection is diff-driven across three tiers; the diff, not
  the scan, is what gates the LLM. Only absent rows and `data_source :metabot` rows are eligible;
  human or unknown future ownership states fail closed. An entity that has left the library is never a
  candidate (its metadata is kept, never regenerated)."
  (:require
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private row-query-chunk-size 500)

(defn- decode-ai-context
  [value]
  (let [decoded (cond-> value (string? value) json/decode+kw)]
    (mu/validate-throw entity-retrieval/AiContext decoded)))

(defn- raw-rows-for-entities
  [entities]
  (let [ids-by-type (reduce (fn [acc entity]
                              (let [[entity-type entity-id] (spec/hydration-key entity)]
                                (update acc entity-type (fnil conj #{}) entity-id)))
                            {}
                            entities)]
    (mapcat (fn [[entity-type ids]]
              (mapcat (fn [id-chunk]
                        (t2/query {:select [:*]
                                   :from   [:osi_ai_context]
                                   :where  [:and
                                            [:= :entity_type entity-type]
                                            [:in :entity_local_id (vec id-chunk)]]}))
                      (partition-all row-query-chunk-size ids)))
            ids-by-type)))

(defn- rows-by-class
  "Raw `osi_ai_context` state for the requested member entities, indexed by entity class. JSON transforms
  are applied per row so one corrupt row cannot abort selection before candidate isolation."
  [entities]
  (into {}
        (map (fn [{:keys [entity_type entity_local_id] :as raw-row}]
               (let [entity-class (entity-retrieval/entity-class entity_type entity_local_id)
                     row          (update raw-row :data_source #(cond-> % (string? %) keyword))]
                 [entity-class
                  (try
                    {:row (-> row
                              (update :ai_context decode-ai-context)
                              (update :basis #(cond-> % (string? %) json/decode+kw)))}
                    (catch Exception e
                      ;; Keep the independently decoded approval state. Corrupt metabot rows become
                      ;; isolated candidate errors; human and unknown ownership states remain excluded.
                      {:row       row
                       :row-error (ex-info "Malformed osi_ai_context generation state"
                                           {:entity-type entity_type :entity-local-id entity_local_id}
                                           e)}))])))
        (raw-rows-for-entities entities)))

(defn- after?
  "Null-safe \"`a` is later than `b`\": false when `a` is NULL, true when `a` is set and `b` is NULL."
  [a b]
  (boolean (and a (or (nil? b) (.isAfter (.toInstant ^java.time.OffsetDateTime a)
                                         (.toInstant ^java.time.OffsetDateTime b))))))

(defn- same-instant?
  [a b]
  (or (identical? a b)
      (and a b (= (.toInstant ^java.time.OffsetDateTime a)
                  (.toInstant ^java.time.OffsetDateTime b)))))

(defn- timestamp-sort-key
  "Oldest first, with nil (never stamped) before real timestamps and entity id as a stable tie-break."
  [timestamp entity]
  [(some? timestamp)
   (some-> ^java.time.OffsetDateTime timestamp .toInstant)
   (:entity_local_id entity)])

(defn- tier
  "Cheap, row-only tier for one member entity's stored `row` (nil when none):
  1 forced (no row, NULL `basis`, or rewrite requested since last generation), 2 timestamp mismatch
  (empty in v1 — nothing writes `invalidated_at` yet), 3 sweep (candidacy still needs the diff),
  nil for rows not owned by `:metabot`, including unknown future ownership states. All comparisons
  null-safe: both timestamps start NULL and NULL = NULL is converged, not a candidate."
  [row]
  (cond
    (and row (not= :metabot (:data_source row)))
    nil

    (or (nil? row)
        (nil? (:basis row))
        (after? (:rewrite_requested_at row) (:generated_at row)))
    1

    (not (same-instant? (:basis_invalidated_at row) (:invalidated_at row)))
    2

    :else
    3))

(defn- candidate
  "Assemble the full candidate map for one hydrated member `entity` — the expensive step, called
  lazily so a capped run does not sweep the whole library. nil when a tier-3 row's recomputed basis
  matches its stored one (converged; costs appdb reads only, no LLM)."
  [entity row tier-n]
  (let [fresh (spec/entity-basis :osi-context entity)
        ;; A row with no stored basis carries :diff nil (fresh generation, not a change);
        ;; basis-diff is never called with a nil old. A tier-1 rewrite row keeps its real diff so the
        ;; prompt can see what changed as well as that a rewrite was asked for.
        diff  (when (:basis row)
                (spec/basis-diff (:basis row) fresh))]
    (when (or (not= 3 tier-n) diff)
      {:entity           entity
       :llm-input        (spec/project :osi-context entity)
       :basis            fresh
       :diff             diff
       :existing-context row
       :rewrite-requested? (boolean (and row
                                         (after? (:rewrite_requested_at row) (:generated_at row))))
       :tier             tier-n})))

(defn- candidate-or-error
  "Build one candidate without letting a malformed entity abort selection for every other entity."
  [entity row tier-n]
  (try
    (candidate entity row tier-n)
    (catch Exception e
      {:entity           entity
       :existing-context row
       :tier             tier-n
       :candidate-error  e})))

(defn- rotate
  [xs offset]
  (let [xs (vec xs)]
    (if (empty? xs)
      xs
      (let [n (mod offset (count xs))]
        (into (subvec xs n) (subvec xs 0 n))))))

(defn- interleave-tiers
  "Flatten sorted tiers into one stable round-robin cursor space. Each tier keeps its internal order,
  while consecutive positions span different tiers whenever they have work."
  [tiers]
  (loop [remaining (mapv seq tiers)
         result    []]
    (if (some seq remaining)
      (recur (mapv next remaining)
             (into result (keep first) remaining))
      result)))

(defn candidates
  "The ordered generation candidates, at most `limit` of them (nil = unbounded).

  Each candidate is `{:entity <hydrated source entity> :llm-input <:osi-context projection output>
  :basis <fresh basis> :diff <basis-diff stored->fresh | nil> :existing-context <stored row | nil>
  :tier 1|2|3}`. `:llm-input` and `:basis` are captured here, before enrichment, so write-back stamps
  exactly what the prompt saw. Order: tier 1, then tier 2 oldest `basis_invalidated_at` first, then
  tier 3 oldest `generated_at` first; `limit` truncates the ordered whole, not per tier.

  Tier-2 candidates may carry a nil `:diff` (the loop restamps and skips the LLM); tier-1 candidates
  go to the LLM regardless of theirs; tier-3 candidacy itself required a non-nil diff.

  `offset` rotates one interleaved, flattened tier sequence. Ordering remains stable within each tier,
  and advancing the offset by the positions examined cannot cycle over fixed per-tier slices or let a
  failing prefix occupy every run forever."
  ([limit]
   (candidates limit 0))
  ([limit offset]
   ;; TODO (Chris 2026-07-24) -- Selection is O(library): member-entities + hydrate load and group the whole
   ;; library before `limit` applies, and tier-3 `take` may scan every converged entity. The expensive
   ;; per-candidate basis/diff/projection and the LLM calls ARE bounded by the cap; this scan is not. On a
   ;; very large instance it can dominate a run. Deferred (measure first): paginate with a resumable
   ;; tier-ordered cursor and check the run deadline mid-scan if a real measurement shows it hurts.
   (let [entities (spec/hydrate :osi-context (spec/member-entities :osi-context))
         rows     (rows-by-class entities)
         tiered   (keep (fn [entity]
                          (let [{:keys [row row-error]} (get rows (spec/hydration-key entity))]
                            (when-let [n (tier row)]
                              (cond-> {:entity entity, :row row, :tier n}
                                row-error (assoc :candidate-error row-error)))))
                        entities)
         by-tier  (group-by :tier tiered)
         tiers    [(sort-by (fn [{:keys [entity row]}]
                              ;; Brand-new entities precede explicit rewrites; within each group,
                              ;; oldest request then stable id.
                              [(some? row)
                               (some-> ^java.time.OffsetDateTime (:rewrite_requested_at row) .toInstant)
                               (:entity_local_id entity)])
                            (by-tier 1))
                   (sort-by (fn [{:keys [entity row]}]
                              (timestamp-sort-key (:basis_invalidated_at row) entity))
                            (by-tier 2))
                   (sort-by (fn [{:keys [entity row]}]
                              (timestamp-sort-key (:generated_at row) entity))
                            (by-tier 3))]
         ordered  (rotate (interleave-tiers tiers) offset)
         ;; the per-entity basis/diff/projection work runs lazily so `limit` bounds it
         ;; Record how many raw cursor positions were traversed to emit each candidate. Converged tier-3
         ;; rows disappear here, but the caller must still advance past them or a later failure can be
         ;; replayed until the scalar offset catches up one emitted candidate at a time.
         traversed (volatile! 0)
         selected  (keep (fn [{:keys [entity row candidate-error], tier-n :tier}]
                           (let [cursor-advance (vswap! traversed inc)
                                 candidate      (if candidate-error
                                                  {:entity entity, :existing-context row, :tier tier-n,
                                                   :candidate-error candidate-error}
                                                  (candidate-or-error entity row tier-n))]
                             (some-> candidate (assoc :cursor-advance cursor-advance))))
                         ordered)]
     (vec (if limit
            (take limit selected)
            selected)))))
