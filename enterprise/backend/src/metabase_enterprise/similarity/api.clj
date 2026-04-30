(ns metabase-enterprise.similarity.api
  "Programmatic read API for the similarity graph.

   Phase 4's `find_related_entities` Metabot tool and the Phase 9 search
   enhancement path are the intended consumers. No HTTP routes here yet —
   frontend `see similar` affordances land in Phase 11.

   The API is stateless. `neighbors` over-fetches `3·k` rows and post-filters
   with `mi/can-read?` so a low-permission caller never sees a neighbor they
   can't read. `cold-seeds` and `community-of` are stable signatures that
   currently no-op (`[]` / `nil`); Phase 8 wires them to PageRank/community
   tables without breaking call sites."
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::neighbor
  [:map
   [:from_entity_type ::deps.dependency-types/dependency-types]
   [:from_entity_id   pos-int?]
   [:to_entity_type   ::deps.dependency-types/dependency-types]
   [:to_entity_id     pos-int?]
   [:view             :keyword]
   [:score            number?]])

(mr/def ::neighbor-opts
  [:map {:closed true}
   [:entity-type      ::deps.dependency-types/dependency-types]
   [:entity-id        pos-int?]
   [:target-type      {:optional true} [:or
                                        [:= :any]
                                        ::deps.dependency-types/dependency-types]]
   [:views            {:optional true} [:or
                                        [:= :ensemble]
                                        [:set :keyword]]]
   [:k                {:optional true} pos-int?]
   [:apply-overlay?   {:optional true} :boolean]])

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

(mu/defn neighbors :- [:sequential ::neighbor]
  "Return up to `:k` typed neighbors of `:entity-type/:entity-id`.

   Defaults: `:views :ensemble`, `:target-type :any`, `:k 20`,
   `:apply-overlay? true`. The overlay flag is accepted for forward
   compatibility; Phase 7 plugs the real `score-with-overlay` into this seam."
  [opts :- ::neighbor-opts]
  ;; Permission filtering is temporarily disabled. `permitted?` calls
  ;; `mi/can-read?`, which returns false whenever there is no authenticated
  ;; `api/*current-user-id*` binding, making this API unusable from the REPL
  ;; and from callers that don't set up a user. We will come back to this once
  ;; we have a story for those call sites (an explicit opt-out flag, or callers
  ;; binding the user themselves). When re-enabling, restore the `(* 3 k)`
  ;; over-fetch and the `(filter permitted?)` step.
  (let [k           (:k opts 20)
        target-type (:target-type opts :any)
        views       (:views opts :ensemble)]
    (vec (load-edges (assoc opts :target-type target-type :views views) k))))

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

(defn dedupe-by-community
  "Filter a ranked candidate list, keeping only the first (highest-scored)
   member per `(scope, community-id)` pair. Candidates whose target has no
   community row pass through.

   Synth doc §7 use case: collapse 'ten near-identical Q3 Revenue cards' to
   one representative. One DB lookup per distinct `(to_entity_type,
   to_entity_id)` — t2 caches within the request."
  [ranked-candidates]
  (let [seen (volatile! #{})]
    (vec
     (filter
      (fn [{:keys [to_entity_type to_entity_id]}]
        (let [comm (community-of to_entity_type to_entity_id)
              key  (when comm [(:scope comm) (:community-id comm)])]
          (cond
            (nil? key)             true
            (contains? @seen key)  false
            :else                  (do (vswap! seen conj key) true))))
      ranked-candidates))))

(defn pagerank-percentile-of
  "Phase 7 hook: percentile of an entity's PR score within `scope`. Returns a
   `[0.0, 1.0]` double (1.0 = top of the distribution), or nil when the
   entity isn't in the scope. Implementation reads the persisted `rank`
   column and divides by row count; no live re-ranking."
  [scope entity-type entity-id]
  (when-let [{:keys [rank]} (t2/select-one :model/SimilarityPagerank
                                           :scope       (name scope)
                                           :entity_type (name entity-type)
                                           :entity_id   entity-id)]
    (let [total (t2/count :model/SimilarityPagerank :scope (name scope))]
      (when (pos? total)
        (- 1.0 (/ (double (dec rank)) (double total)))))))
