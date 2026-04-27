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

(defn cold-seeds
  "Return canonical entities for cold-start retrieval.

   Phase 8 wires this to `similarity_pagerank`; until then the empty list is
   the documented cold-start fallback so Phase 4 can call this without a
   feature check."
  [_opts]
  [])

(defn community-of
  "Return community membership of `entity-type/entity-id`, or nil if unknown.

   Phase 8 populates `similarity_community`; nil is the documented cold-start
   fallback."
  [_entity-type _entity-id]
  nil)
