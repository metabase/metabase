(ns metabase-enterprise.similarity.overlay
  "Retrieval-time governance overlay: re-score a list of `:model/SimilarEdge`
   neighbor rows by a multiplier built from per-entity attributes (verified,
   canonical/published table, metric card, view-count percentile, PageRank
   percentile).

   Synth doc §6 is the design. The overlay is a *post-fusion* lever: it does
   not change which neighbors exist, it changes their order and lets a
   verified+canonical card outrank an unverified peer with marginally higher
   RRF score. `score-with-overlay` is the only public entry; the loaders and
   percentile helpers are private but designed to be `with-redefs`-friendly so
   the unit tests can drive the pure formula without a DB hit.

   Two attribute sources, both batched:
     - appdb governance (`load-governance`): one query per `to_entity_type`
       bucket against `report_card` / `report_dashboard` / `metabase_table`
       (and `moderation_review` joined in).
     - PageRank scope (`load-pr-percentiles`): one query per scope against
       `similarity_pagerank` to materialize percentile = `1 − (rank − 1)/total`.
       Pulled out of `api/pagerank-percentile-of` to avoid the N+1 implied by
       the per-row helper, and to keep this namespace from requiring `api.clj`
       (the inverse direction is the architectural one).

   Per-type applicability is enforced by the loader: types with no governance
   signal (snippet, transform, document, sandbox, segment, measure) get a
   neutral all-`1.0` map without hitting the DB.

   The multiplier is clamped at `:ceiling 4.0` (governance-config) — a hedge
   against multiplicative long-tail when an entity stacks every signal.
   `multiplier-for` is pure given a fixed attrs map and config; the unit tests
   pin its identity behavior at every flag combination."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def governance-config
  "Public config for the overlay. Synth doc §6 illustrative defaults; Phase 5
   eval will recalibrate. The ceiling clamp is the load-bearing knob — adding
   a new signal must consider whether the unclamped maximum still sits sanely
   relative to the clamp.

   Unclamped max with current six factors: `1.4 · 1.3 · 1.2 · 1.2 · 1.5 · 1.4
   ≈ 5.50`. Clamp at 4.0 keeps the overlay from dominating the fused score
   when an entity hits every signal."
  {:multipliers {:verified        1.4
                 :canonical       1.3
                 :published       1.2
                 :is-metric       1.2
                 :view-count-coef 0.5
                 :pagerank-coef   0.4}
   :ceiling     4.0})

(def ^:private neutral-attrs
  "All-`false`/-`nil` attribute map; entities with no governance signal yield
   this without a DB hit. `multiplier-for` over this map returns `1.0`."
  {:verified?             false
   :canonical?            false
   :published?            false
   :is-metric?            false
   :view-count            nil
   :view-count-percentile nil
   :pr-percentile         nil})

(defn- multiplier-for
  "Pure formula: combine governance attributes into a single bounded
   multiplier per the config. Missing-percentile inputs contribute `1.0×`,
   matching the floor for entities with no PR or view-count data — *not* zero
   (multiplicative zero would silently drop entities)."
  [{:keys [verified? canonical? published? is-metric?
           view-count-percentile pr-percentile]}
   {{:keys [verified canonical published is-metric
            view-count-coef pagerank-coef]} :multipliers
    ceiling :ceiling}]
  (min (double ceiling)
       (* (if verified?  (double verified)  1.0)
          (if canonical? (double canonical) 1.0)
          (if published? (double published) 1.0)
          (if is-metric? (double is-metric) 1.0)
          (+ 1.0 (* (double view-count-coef) (double (or view-count-percentile 0.0))))
          (+ 1.0 (* (double pagerank-coef)   (double (or pr-percentile         0.0)))))))

;; --- governance loader ----------------------------------------------------

(defn- load-card-governance
  [ids]
  (when (seq ids)
    (let [rows (t2/query
                {:select    [:c.id :c.view_count :c.type
                             [[:case [:= :mr.id nil] [:inline false]
                               :else                 [:inline true]]
                              :verified]]
                 :from      [[:report_card :c]]
                 :left-join [[{:select [:moderated_item_id :id]
                               :from   [:moderation_review]
                               :where  [:and
                                        [:= :most_recent true]
                                        [:= :status "verified"]
                                        [:= :moderated_item_type "card"]]}
                              :mr]
                             [:= :mr.moderated_item_id :c.id]]
                 :where     [:in :c.id ids]})]
      (into {}
            (map (fn [{:keys [id view_count type verified]}]
                   [[:card id]
                    {:verified?             (boolean verified)
                     :canonical?            false
                     :published?            false
                     :is-metric?            (= "metric" (some-> type name))
                     :view-count            view_count
                     :view-count-percentile nil
                     :pr-percentile         nil}]))
            rows))))

(defn- load-dashboard-governance
  [ids]
  (when (seq ids)
    (let [rows (t2/query
                {:select    [:d.id :d.view_count
                             [[:case [:= :mr.id nil] [:inline false]
                               :else                 [:inline true]]
                              :verified]]
                 :from      [[:report_dashboard :d]]
                 :left-join [[{:select [:moderated_item_id :id]
                               :from   [:moderation_review]
                               :where  [:and
                                        [:= :most_recent true]
                                        [:= :status "verified"]
                                        [:= :moderated_item_type "dashboard"]]}
                              :mr]
                             [:= :mr.moderated_item_id :d.id]]
                 :where     [:in :d.id ids]})]
      (into {}
            (map (fn [{:keys [id view_count verified]}]
                   [[:dashboard id]
                    {:verified?             (boolean verified)
                     :canonical?            false
                     :published?            false
                     :is-metric?            false
                     :view-count            view_count
                     :view-count-percentile nil
                     :pr-percentile         nil}]))
            rows))))

(defn- load-table-governance
  [ids]
  (when (seq ids)
    (let [rows (t2/query
                {:select [:id :view_count :data_layer :is_published]
                 :from   [:metabase_table]
                 :where  [:in :id ids]})]
      (into {}
            (map (fn [{:keys [id view_count data_layer is_published]}]
                   [[:table id]
                    {:verified?             false
                     :canonical?            (= "final" (some-> data_layer name))
                     :published?            (boolean is_published)
                     :is-metric?            false
                     :view-count            view_count
                     :view-count-percentile nil
                     :pr-percentile         nil}]))
            rows))))

(defn- load-governance
  "Return a map keyed by `[entity-type entity-id]` → governance-attrs.
   One batched query per type bucket. Types with no governance signal yield
   `neutral-attrs` without hitting the DB."
  [tuples]
  (let [by-type (group-by first tuples)]
    (into {}
          (mapcat (fn [[etype tups]]
                    (let [ids (mapv second tups)]
                      (case etype
                        :card      (load-card-governance      ids)
                        :dashboard (load-dashboard-governance ids)
                        :table     (load-table-governance     ids)
                        ;; snippet, transform, document, sandbox, segment, measure
                        (mapv (fn [[t i]] [[t i] neutral-attrs]) tups)))))
          by-type)))

;; --- view-count percentile (in-process, candidate-set rank) --------------

(defn- view-count-percentiles
  "Return a map `[entity-type entity-id]` → percentile (0.0–1.0) over the
   loaded candidate set's view-counts. Synth doc §6: candidate-set rank is
   the 'more correct' choice; quantization is a non-issue at `c·k = 60`.

   Tuples whose attrs map carries a nil `:view-count` are omitted from the
   result (the multiplier formula treats `nil` as `0.0` floor). Singleton
   inputs (`n=1`) are pinned at 0.5 — no information to differentiate. Ties
   resolve by stable sort order — exact percentile within a tie group is
   immaterial since the multiplier coefficient is 0.5 and at most one tied
   member will be elevated by an immaterial increment."
  [tuples gov]
  (let [scored (keep (fn [tup]
                       (when-let [vc (:view-count (gov tup))]
                         [tup (long vc)]))
                     tuples)
        n      (count scored)]
    (cond
      (zero? n) {}
      (= 1 n)   {(ffirst scored) 0.5}
      :else
      (let [sorted (sort-by second scored)]
        (into {}
              (map-indexed (fn [idx [tup _vc]]
                             [tup (double (/ idx (dec n)))]))
              sorted)))))

;; --- PageRank percentile (batched) ----------------------------------------

(defn- load-pr-percentiles
  "Batch-load PageRank percentile per `[entity-type entity-id]` tuple. One
   query per scope to fetch ranks; one count query per scope. Result: each
   tuple → `1 − (rank − 1)/total` ∈ [0.0, 1.0]; missing rows omitted.

   Per-type scope dispatch: the overlay asks 'how canonical is this card
   *among cards*' (synth doc §7), so we read from `scope = name(entity-type)`."
  [tuples]
  (when (seq tuples)
    (let [by-type (group-by first tuples)]
      (into {}
            (mapcat (fn [[etype tups]]
                      (let [scope (name etype)
                            ids   (mapv second tups)
                            rows  (t2/select
                                   [:model/SimilarityPagerank :entity_id :rank]
                                   :scope       scope
                                   :entity_type scope
                                   :entity_id   [:in ids])
                            total (long (or (t2/count :model/SimilarityPagerank :scope scope) 0))]
                        (when (pos? total)
                          (mapv (fn [{:keys [entity_id rank]}]
                                  [[etype entity_id]
                                   (- 1.0 (/ (double (dec rank)) (double total)))])
                                rows)))))
            by-type))))

;; --- public surface -------------------------------------------------------

(defn score-with-overlay
  "Re-score and re-sort a sequence of `:model/SimilarEdge` rows by the
   governance multiplier.

   Inputs:
     rows - seq of rows; each must have `:to_entity_type`, `:to_entity_id`,
            `:score`. Other keys pass through.
     opts - reserved for future use (calibration variants, scope override).

   Returns:
     vector of rows with `:score` replaced by the overlay'd score,
     `:fused_score` added (the original RRF score), `:overlay_multiplier`
     added (the post-ceiling product), re-sorted by `:score` desc.

   Empty-input contract: returns `[]` without DB hits."
  [rows _opts]
  (if-not (seq rows)
    []
    (let [tuples  (mapv (juxt :to_entity_type :to_entity_id) rows)
          gov     (load-governance tuples)
          vc-pcts (view-count-percentiles tuples gov)
          pr-pcts (load-pr-percentiles tuples)
          cfg     governance-config]
      (->> rows
           (mapv (fn [{:keys [to_entity_type to_entity_id score] :as row}]
                   (let [k     [to_entity_type to_entity_id]
                         attrs (-> (gov k neutral-attrs)
                                   (assoc :view-count-percentile (vc-pcts k)
                                          :pr-percentile         (pr-pcts k)))
                         m     (multiplier-for attrs cfg)]
                     (assoc row
                            :fused_score        (double score)
                            :overlay_multiplier (double m)
                            :score              (* (double score) (double m))))))
           (sort-by :score >)
           vec))))
