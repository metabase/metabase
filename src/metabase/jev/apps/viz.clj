(ns metabase.jev.apps.viz
  "Jev-ranked visualization suggestions for a query result.

  When a question returns, the FE shows a rail of ~12 chart types and the user guesses which fits. This
  ranks them. Two halves, in the pattern we keep landing on:

    1. DETERMINISTIC (Metabase already knows this — no Jev): each result column's ROLE comes straight from
       `:cols` — `:source :breakout` = dimension, `:source :aggregation` = metric; `:base_type`/`:unit`/
       `:semantic_type` give temporal/categorical/geo. We compress the result into a one-line structure
       (\"a metric over time, split by a category\") plus per-column role facts.

    2. JEV (the judgment): SCORE each chart type independently against that structure — not `choice` (which
       forces one pick and hid that line/area/bar are all reasonable), but a `noul` per chart, run in
       PARALLEL. We rank by score and the FE highlights the top few. Jev's honest spread across
       comparably-good charts becomes the highlight set; the nonsense charts (a pie of a time series)
       score near zero and grey out.

  Advisory only: it ranks/highlights, never changes the user's chart. Prototype scaffolding."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.client :as jev]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Deterministic role extraction — Metabase already computed this
;;; ---------------------------------------------------------------------------------------------------

(defn- column-role
  "The role of a result column, from metadata Metabase already produced. Value-free — types and source
  only, never the data. Returns one of :temporal-dimension :geo-dimension :category-dimension
  :numeric-dimension :metric."
  [{:keys [source base_type semantic_type]}]
  (let [bt (some-> base_type keyword)
        st (some-> semantic_type keyword)]
    (cond
      (= (keyword source) :aggregation)          :metric
      (isa? st :type/Latitude)                    :geo-dimension
      (isa? st :type/Longitude)                   :geo-dimension
      (isa? bt :type/Temporal)                    :temporal-dimension
      (isa? bt :type/Number)                      :numeric-dimension
      :else                                       :category-dimension)))

(defn- summarize-columns
  "Turn result `:cols` into role facts + counts. `cols` is a seq of maps with :name :base_type
  :semantic_type :source (:unit optional)."
  [cols]
  (let [roled (mapv (fn [c] (assoc (select-keys c [:name :unit]) :role (column-role c))) cols)
        by-role (frequencies (map :role roled))]
    {:columns          roled
     :metric-count     (get by-role :metric 0)
     :temporal-count   (get by-role :temporal-dimension 0)
     :category-count   (get by-role :category-dimension 0)
     :geo-count        (get by-role :geo-dimension 0)
     :numeric-dim-count (get by-role :numeric-dimension 0)}))

(defn- structure-sentence
  "A one-line English description of the result's shape, from the role summary. This is the compressed
  observation Jev reasons over — the intelligence is here, not in the scoring."
  [{:keys [metric-count temporal-count category-count geo-count numeric-dim-count]}]
  (let [metric   (cond (zero? metric-count) "no aggregated metric"
                       (= 1 metric-count)   "one metric"
                       :else                (str metric-count " metrics"))
        dims     (cond-> []
                   (pos? temporal-count)   (conj (if (> temporal-count 1) "over multiple time dimensions" "over time"))
                   (pos? category-count)   (conj (if (> category-count 1)
                                                   (str "broken out by " category-count " categories")
                                                   "broken out by a category"))
                   (pos? geo-count)        (conj "with geographic coordinates")
                   (pos? numeric-dim-count) (conj "against a numeric dimension"))]
    (str metric
         (when (seq dims) (str " " (str/join ", " dims)))
         ".")))

;;; ---------------------------------------------------------------------------------------------------
;;; Chart candidates — the fixed vocabulary Jev scores against
;;; ---------------------------------------------------------------------------------------------------

(def ^:private chart-candidates
  "Chart display type -> a short description of when it fits. Jev scores each independently."
  {:line    "Trends of a metric over time; multiple series for a category split."
   :area    "Cumulative composition of a metric over time (stacked)."
   :bar     "Comparing a metric across a handful of categories."
   :row     "Comparing a metric across many categories (horizontal bars)."
   :combo   "A metric over time where two measures share an axis."
   :pie     "Parts of a single whole across a few categories; no time dimension."
   :scatter "Relationship between two numeric measures."
   :table   "Row-level detail, or when no chart adds insight."
   :pivot   "A metric crosstabbed across two dimensions."
   :map     "Geographic data plotted by latitude/longitude or region."
   :scalar  "A single aggregate number, no dimensions."
   :funnel  "A metric decreasing through ordered stages."})

(defn- score-charts
  "Ask Jev to score every chart against the structure, in ONE parallel request. Returns a vector of
  `{:display <kw> :score <0..1>}` ranked high-to-low."
  [structure summary]
  (let [state     {:structure structure
                   :metric_count (:metric-count summary)
                   :dimension_columns (->> (:columns summary)
                                           (remove #(= :metric (:role %)))
                                           (mapv #(select-keys % [:name :role :unit])))}
        questions (into {}
                        (map (fn [[display desc]]
                               [display (jev/noul (str "Would a " (name display)
                                                       " chart be a good visualization for this result? " desc))]))
                        chart-candidates)
        result    (jev/ask state questions)]
    (when (:ok result)
      (->> (:answers result)
           (map (fn [[display ans]] {:display display :score (:noul ans)}))
           (sort-by :score >)
           vec))))

;;; ---------------------------------------------------------------------------------------------------
;;; Endpoint
;;; ---------------------------------------------------------------------------------------------------

(defn suggest-visualizations
  "Rank chart types for a result described by `cols` (a seq of `{:name :base_type :semantic_type :source
  :unit?}`). Returns `{:structure <sentence> :roles [...] :ranked [{:display :score} ...]}`."
  [cols]
  (let [summary   (summarize-columns cols)
        structure (structure-sentence summary)
        ranked    (score-charts structure summary)]
    {:structure structure
     :roles     (:columns summary)
     :ranked    (or ranked [])}))

(api.macros/defendpoint :post "/viz/suggest" :- :any
  "Rank visualization types for a query result. Body: `{:cols [{:name :base_type :semantic_type :source
  :unit?} ...]}` (the result `:cols` metadata). Roles are derived deterministically; Jev scores each
  chart type against the derived structure. Advisory — the FE highlights the top-ranked, never changes
  the chart."
  [_route-params
   _query-params
   {:keys [cols]} :- [:map {:closed false, ::mr/deliberately-open true}
                      [:cols [:sequential [:map {:closed false, ::mr/deliberately-open true}]]]]]
  (api/check-superuser) ; prototype: keep it admin-only for now
  (suggest-visualizations cols))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/viz/…` routes."
  (api.macros/ns-handler *ns*))
