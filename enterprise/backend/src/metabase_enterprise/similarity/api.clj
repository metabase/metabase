(ns metabase-enterprise.similarity.api
  "Programmatic read API for the similarity graph.

   Phase 4's `find_related_entities` Metabot tool and the Phase 9 search
   enhancement path are the intended consumers. No HTTP routes here yet —
   frontend `see similar` affordances land in Phase 11.

   The API is stateless. `neighbors` over-fetches `3·k` rows from
   `similar_edge`, optionally re-scores them through the governance overlay,
   optionally collapses near-clones via Louvain community membership, and
   returns the top `k`. Both passes are reversible per-call flags so the same
   materialization serves multiple intents (find-canonical, find-duplicates,
   raw exploration). `cold-seeds` and `community-of` read Phase 8's outputs;
   `pagerank-percentile-of` is a per-row helper kept around for callers that
   need a one-off percentile lookup outside the overlay's batched path."
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.similarity.overlay :as overlay]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::neighbor
  [:map
   [:from_entity_type   ::deps.dependency-types/dependency-types]
   [:from_entity_id     pos-int?]
   [:to_entity_type     ::deps.dependency-types/dependency-types]
   [:to_entity_id       pos-int?]
   [:view               :keyword]
   [:score              number?]
   ;; Set only when overlay applies; the pre-overlay RRF score and the
   ;; post-ceiling multiplier surface here for debugging and Phase 5
   ;; attribution. Off-overlay returns are byte-identical to Phase 6.
   [:fused_score        {:optional true} number?]
   [:overlay_multiplier {:optional true} number?]])

(mr/def ::neighbor-opts
  [:map {:closed true}
   [:entity-type           ::deps.dependency-types/dependency-types]
   [:entity-id             pos-int?]
   [:target-type           {:optional true} [:or
                                             [:= :any]
                                             ::deps.dependency-types/dependency-types]]
   [:views                 {:optional true} [:or
                                             [:= :ensemble]
                                             [:set :keyword]]]
   [:k                     {:optional true} pos-int?]
   [:apply-overlay?        {:optional true} :boolean]
   [:dedupe-by-community?  {:optional true} :boolean]])

(mr/def ::cold-seeds-opts
  [:map {:closed true}
   [:type  {:optional true} ::deps.dependency-types/dependency-types]
   [:scope {:optional true} [:enum :instance]]
   [:k     {:optional true} pos-int?]])

(mr/def ::canonical
  [:map
   [:entity_type ::deps.dependency-types/dependency-types]
   [:entity_id   pos-int?]
   [:score       number?]
   [:rank        pos-int?]])

(def ^:private dedup-overfetch-coef
  "How many `k`-multiples of raw rows to load before overlay + dedup. `c=3`
   gives ~50% headroom for the typical 30–50% community-dedup shrinkage on
   hub seeds. Synth doc §6.3."
  3)

(def ^:private max-supported-k
  "Largest `k` the over-fetch ceiling comfortably supports under the current
   `:top-k-per-source 50` cap in `fusion/ensemble-config`. Calling
   `neighbors` with a larger `k` proceeds but logs a one-line warn — dedup
   may under-deliver if shrinkage exceeds the buffer."
  25)

(defn- view-clause
  "Compile the `:views` opt into a HoneySQL where-fragment."
  [views]
  (cond
    (= views :ensemble)         [:= :view "ensemble"]
    (and (set? views) (seq views)) [:in :view (mapv name views)]
    :else                       [:= :view "ensemble"]))

(defn- target-clause
  "Optional `:target-type` filter. Returns nil when `:any` (or absent) so
   callers can splice into a `:and` without a false branch."
  [target-type]
  (when (and target-type (not= target-type :any))
    [:= :to_entity_type (name target-type)]))

(defn- load-edges
  "Pull up to `limit` rows from `similar_edge` for the given source, sorted by
   score-desc. Returns `:model/SimilarEdge` rows with keyword-coerced enum
   columns (per the model's transforms)."
  [{:keys [entity-type entity-id target-type views]} limit]
  (let [where (cond-> [:and
                       [:= :from_entity_type (name entity-type)]
                       [:= :from_entity_id   entity-id]
                       (view-clause views)]
                (target-clause target-type) (conj (target-clause target-type)))]
    (t2/select :model/SimilarEdge
               {:where    where
                :order-by [[:score :desc]]
                :limit    limit})))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- permitted?
  "Permission check for one neighbor row: dispatch `to_entity_type` to the
   matching Toucan2 model and call `mi/can-read?`. Unknown types
   (shouldn't happen given the schema) are filtered out."
  [{:keys [to_entity_type to_entity_id]}]
  (when-let [model (deps.dependency-types/dependency-type->model to_entity_type)]
    (try
      (mi/can-read? model to_entity_id)
      (catch Throwable t
        (log/debugf t "Permission check failed for %s/%s; treating as denied"
                    to_entity_type to_entity_id)
        false))))

(defn- load-communities
  "Return a map `[entity-type entity-id]` → `{:scope :community-id :centrality}`
   for the given tuples. One query per type bucket against
   `similarity_community`. Communities are per-type, so `scope = entity_type`."
  [tuples]
  (when (seq tuples)
    (let [by-type (group-by first tuples)]
      (into {}
            (mapcat (fn [[etype tups]]
                      (let [scope (name etype)
                            ids   (mapv second tups)
                            rows  (t2/select :model/SimilarityCommunity
                                             :scope       scope
                                             :entity_type scope
                                             :entity_id   [:in ids])]
                        (mapv (fn [r]
                                [[etype (:entity_id r)]
                                 {:scope        (:scope r)
                                  :community-id (:community_id r)
                                  :centrality   (:centrality r)}])
                              rows))))
            by-type))))

(defn dedupe-by-community
  "Filter a ranked candidate list, keeping only the first (highest-scored)
   member per `(scope, community-id)` pair. Candidates whose target has no
   community row pass through.

   Synth doc §7 use case: collapse 'ten near-identical Q3 Revenue cards' to
   one representative. Single batched lookup per call against
   `similarity_community`, replacing the prior per-row `community-of`
   round-trip."
  [ranked-candidates]
  (if-not (seq ranked-candidates)
    []
    (let [tuples (mapv (juxt :to_entity_type :to_entity_id) ranked-candidates)
          comms  (load-communities tuples)
          seen   (volatile! #{})]
      (vec
       (filter
        (fn [{:keys [to_entity_type to_entity_id]}]
          (let [comm (comms [to_entity_type to_entity_id])
                key  (when comm [(:scope comm) (:community-id comm)])]
            (cond
              (nil? key)             true
              (contains? @seen key)  false
              :else                  (do (vswap! seen conj key) true))))
        ranked-candidates)))))

(mu/defn neighbors :- [:sequential ::neighbor]
  "Return up to `:k` typed neighbors of `:entity-type/:entity-id`.

   Pipeline:
     1. SQL load `(c · k)` raw rows from `similar_edge` (over-fetch headroom
        for the dedup shrink).
     2. If `:apply-overlay?` (default `true`), re-score via the governance
        overlay (`overlay/score-with-overlay`) — verified, canonical/published
        tables, metric cards, view-count percentile, PageRank percentile —
        and re-sort.
     3. If `:dedupe-by-community?` (default `true`), collapse same-community
        near-clones to one representative via Louvain labels.
     4. Take `:k`.

   Order matters: overlay before dedup, so dedup picks the best post-overlay
   representative within each community. Each pass is reversible — flipping
   either flag exposes other intents (find-duplicates, raw exploration) over
   the same materialized index.

   Defaults: `:views :ensemble`, `:target-type :any`, `:k 20`,
   `:apply-overlay? true`, `:dedupe-by-community? true`."
  [opts :- ::neighbor-opts]
  ;; Permission filtering is temporarily disabled. `permitted?` calls
  ;; `mi/can-read?`, which returns false whenever there is no authenticated
  ;; `api/*current-user-id*` binding, making this API unusable from the REPL
  ;; and from callers that don't set up a user. We will come back to this once
  ;; we have a story for those call sites (an explicit opt-out flag, or callers
  ;; binding the user themselves). When re-enabling, restore the permission
  ;; filter step before `take`.
  (let [{:keys [k apply-overlay? dedupe-by-community?]
         :or   {k                    20
                apply-overlay?       true
                dedupe-by-community? true}} opts
        target-type (:target-type opts :any)
        views       (:views opts :ensemble)]
    (when (> k max-supported-k)
      (log/warnf "neighbors: k=%d exceeds max-supported-k=%d; dedup may under-deliver"
                 k max-supported-k))
    (let [load-k  (* dedup-overfetch-coef k)
          rows    (vec (load-edges (assoc opts :target-type target-type :views views) load-k))
          rows    (cond-> rows
                    (and apply-overlay?       (seq rows)) (overlay/score-with-overlay {})
                    (and dedupe-by-community? (seq rows)) dedupe-by-community)]
      (vec (take k rows)))))

(mu/defn cold-seeds :- [:sequential ::canonical]
  "Return canonical entities by PageRank score within the requested scope.

   Defaults: `:scope :instance, :k 10`. When `:type` is provided, reads the
   per-type PageRank table (`scope = name(type)`); otherwise reads the
   polymorphic `:full` table. Phase 9's `list_canonical_entities` Metabot
   tool wraps this with user-context permission filtering. Empty when the
   index hasn't been built — the documented cold-start fallback."
  [opts :- ::cold-seeds-opts]
  (let [{:keys [type k]
         :or   {k 10}} opts
        pg-scope (if type (name type) "full")]
    (->> (t2/select :model/SimilarityPagerank
                    {:where    (cond-> [:and [:= :scope pg-scope]]
                                 type (conj [:= :entity_type (name type)]))
                     :order-by [[:rank :asc]]
                     :limit    k})
         (mapv #(select-keys % [:entity_type :entity_id :score :rank])))))

(defn community-of
  "Return Louvain community membership for an entity, or nil if untyped /
   uncomputed. Communities are per-type: `scope = name(entity-type)`. Returns
   `{:scope :community-id :centrality}` on hit."
  [entity-type entity-id]
  (when-let [row (t2/select-one :model/SimilarityCommunity
                                :scope       (name entity-type)
                                :entity_type (name entity-type)
                                :entity_id   entity-id)]
    {:scope        (:scope row)
     :community-id (:community_id row)
     :centrality   (:centrality row)}))

(defn pagerank-percentile-of
  "Per-row PageRank percentile within `scope`. Returns a `[0.0, 1.0]` double
   (1.0 = top of the distribution), or nil when the entity isn't in scope.
   The overlay (`overlay/score-with-overlay`) does its own batched read; this
   helper exists for one-off lookups (e.g. researcher REPL inspection)."
  [scope entity-type entity-id]
  (when-let [{:keys [rank]} (t2/select-one :model/SimilarityPagerank
                                           :scope       (name scope)
                                           :entity_type (name entity-type)
                                           :entity_id   entity-id)]
    (let [total (t2/count :model/SimilarityPagerank :scope (name scope))]
      (when (pos? total)
        (- 1.0 (/ (double (dec rank)) (double total)))))))
