(ns metabase-enterprise.similarity.fusion
  "Reciprocal Rank Fusion across similarity views, plus the per-typed-pair
   ensemble config registry.

   `views.ensemble` is the only intended caller of `fuse-ranks`; the config map
   is consulted by `views.ensemble` (at compute time) and may be consulted by
   `api/neighbors` later for diagnostic tooling.

   The math is identical to `metabase.metabot.tools.search/reciprocal-rank-fusion`
   — the difference is that we are fusing per-source neighbor lists out of the
   `similar_edge` table rather than result lists from search engines.")

(def ^:private default-config
  "Per-typed-pair ensemble configuration. Add typed pairs as later phases earn
   them through eval lift. Phase 3 ships only [:card :card]."
  {[:card :card]
   {:views            [:direct-dependency :co-dashboard :source-table-jaccard]
    :weights          {:direct-dependency 1.5
                       :co-dashboard      1.2}
    :k                60
    :top-k-per-source 50}})

(defn ensemble-config
  "Public accessor for the typed-pair → config map. Tests rebind via
   `with-redefs`; the Phase 5 eval harness will sweep weights/k by the same
   mechanism."
  []
  default-config)

(defn weight-for
  "Resolve the weight for `view` in the given typed-pair config, defaulting to 1.0."
  [config view]
  (get (:weights config) view 1.0))

(defn fuse-ranks
  "Reference RRF implementation, JVM-side.

   Inputs:
     ranked-lists - sequence of `[view-name [neighbor1 neighbor2 ...]]`
                    pairs, where each neighbor list is already sorted by
                    within-view score DESC. Each neighbor map carries
                    `:to_entity_type` and `:to_entity_id`.
     config       - `{:weights {view->w} :k <int>}` from `ensemble-config`.

   Returns a sorted seq of `{:to-type ... :to-id ... :score <fused>
   :contributing [{:view :rank :weight} ...]}` maps.

   The production codepath for materialization lives in `views.ensemble` and
   does the same math in SQL with window functions. This fn exists as the
   unit-testable reference and a fallback if the SQL path hits portability
   issues."
  [ranked-lists {:keys [k] :as config}]
  (let [k (or k 60)]
    (->> ranked-lists
         (mapcat
          (fn [[view neighbors]]
            (map-indexed
             (fn [idx {:keys [to_entity_type to_entity_id]}]
               {:to-type to_entity_type
                :to-id   to_entity_id
                :view    view
                :rank    (inc idx)
                :weight  (weight-for config view)})
             neighbors)))
         (group-by (juxt :to-type :to-id))
         (map (fn [[[to-type to-id] entries]]
                {:to-type      to-type
                 :to-id        to-id
                 :score        (reduce + (map (fn [{:keys [weight rank]}]
                                                (/ (double weight) (+ k rank)))
                                              entries))
                 :contributing (mapv #(select-keys % [:view :rank :weight]) entries)}))
         (sort-by :score >))))
