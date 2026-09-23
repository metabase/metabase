(ns metabase.jev.apps.dashboard-focus
  "Point a dashboard at a question. Given a user's stated intent, score how well each card and filter on a
  dashboard helps answer it, so the UI can re-focus the dashboard — surface the relevant cards, dim the
  rest, highlight the useful filters. A dashboard stops being a fixed artifact and becomes a lens.

  Two halves, the pattern we keep landing on:

    1. DETERMINISTIC (no Jev): compress each card to a value-free observation from metadata Metabase
       already has — name, description, chart type, and its columns' roles (metric/dimension/temporal/
       geo, from result_metadata). Each filter → {name, type, target column role}. The intelligence is
       in this representation; Jev never sees rendered pixels or row data.

    2. JEV (the judgment): score each card's and filter's RELEVANCE to the intent — a `noul` per item,
       run in PARALLEL in one request. Calibration is the feature: when a dashboard is a weak fit for the
       question, the cards score uniformly low and Jev honestly says so, while the *ranking* still floats
       the closest ones up. Filters usually separate cleanly (the right ones score high).

  Read-only: it returns a scored VIEW; it never mutates the saved dashboard. Prototype scaffolding."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.client :as jev]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Deterministic compression — value-free observations from metadata Metabase already has
;;; ---------------------------------------------------------------------------------------------------

(defn- column-role
  "Coarse role of a result column, from its types. Value-free."
  [{:keys [base_type semantic_type]}]
  (let [bt (some-> base_type keyword)
        st (some-> semantic_type keyword)]
    (cond
      (isa? st :type/Latitude)   :geo
      (isa? st :type/Longitude)  :geo
      (isa? bt :type/Temporal)   :temporal
      (isa? bt :type/Number)     :numeric
      :else                      :text)))

(defn- card-observation
  "Compress a card to what Jev needs to judge relevance: title, description, chart type, and a short
  list of its columns' names + roles. No row data."
  [card]
  {:title       (:name card)
   :description (:description card)
   :chart       (some-> (:display card) name)
   :columns     (mapv (fn [col] {:name (:name col) :role (column-role col)})
                      (take 8 (:result_metadata card)))})

(defn- filter-observation
  "Compress a dashboard parameter (filter) to name + type."
  [param]
  {:name (:name param)
   :type (some-> (:type param) name)
   :slug (:slug param)})

(defn- dashboard-observations
  "Everything Jev scores for a dashboard: per-dashcard observations (with position/size/tab for the FE to
  re-layout) and per-filter observations."
  [dashboard-id]
  (let [dcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        dash   (t2/select-one :model/Dashboard :id dashboard-id)
        cards  (->> dcards
                    (keep (fn [dc]
                            (when-let [card-id (:card_id dc)]
                              (when-let [card (t2/select-one :model/Card :id card-id)]
                                {:dashcard-id (:id dc)
                                 :card-id     card-id
                                 :tab-id      (:dashboard_tab_id dc)
                                 :pos         (select-keys dc [:row :col :size_x :size_y])
                                 :observation (card-observation card)}))))
                    vec)]
    {:cards   cards
     :filters (mapv filter-observation (:parameters dash))
     :name    (:name dash)
     :tabs    (mapv #(select-keys % [:id :name]) (t2/select :model/DashboardTab :dashboard_id dashboard-id))}))

;;; ---------------------------------------------------------------------------------------------------
;;; Jev scoring — relevance of each card + filter to the intent, in one parallel request
;;; ---------------------------------------------------------------------------------------------------

(defn- describe-card [{:keys [title description chart columns]}]
  (str "\"" title "\""
       (when (seq description) (str " — " description))
       (when (seq columns)
         (str " [columns: " (str/join ", " (map (fn [c] (str (:name c) " (" (name (:role c)) ")")) columns)) "]"))
       (when chart (str " shown as a " chart " chart"))))

(def ^:private relevance-levels
  "Ordered rubric for how relevant a card is to the question. `score` spreads across this far better than
  a `noul` yes/no, so the ranking has a visible gradient even when the whole dashboard fits weakly."
  ["irrelevant to the question"
   "tangentially related"
   "somewhat helpful"
   "directly answers the question"])

(defn- score-relevance
  "Score each card + filter against `intent` in ONE parallel Jev request. Cards use a graded `score`
  rubric (relevance is graded, and the values separate well); filters use `noul` (helps-narrow or not).
  Returns `{:card-scores {dashcard-id score} :filter-scores {slug score}}`."
  [intent {:keys [cards filters]}]
  (let [state       {:my_question intent}
        card-qs     (into {}
                          (map (fn [{:keys [dashcard-id observation]}]
                                 [(keyword "card" (str dashcard-id))
                                  (jev/score (str "How relevant is the dashboard card " (describe-card observation)
                                                  " to the question?")
                                             relevance-levels)]))
                          cards)
        filter-qs   (into {}
                          (map (fn [{:keys [name type slug]}]
                                 [(keyword "filter" (str slug))
                                  (jev/noul (str "Is the filter \"" name "\" (a " type " filter) useful for "
                                                 "narrowing this dashboard to answer the question?"))]))
                          filters)
        result      (jev/ask state (merge card-qs filter-qs))]
    (when (:ok result)
      (let [answers (:answers result)]
        {:card-scores   (into {} (map (fn [{:keys [dashcard-id]}]
                                        [dashcard-id (get-in answers [(keyword "card" (str dashcard-id)) :score])])
                                      cards))
         :filter-scores (into {} (map (fn [{:keys [slug]}]
                                        [slug (get-in answers [(keyword "filter" (str slug)) :noul])])
                                      filters))}))))

;;; ---------------------------------------------------------------------------------------------------
;;; Endpoint
;;; ---------------------------------------------------------------------------------------------------

(def ^:private card-highlight-fraction
  "Fraction of cards (by rank) to mark as focused; the rest dim. Cards can score uniformly low on a weak
  fit, so we highlight *relatively* (top fraction) rather than by an absolute threshold."
  0.4)

(def ^:private filter-highlight-threshold
  "Filters separate cleanly by relevance, so highlight by absolute score."
  0.6)

(defn focus-dashboard
  "Score dashboard `dashboard-id`'s cards and filters against `intent`. Returns a ranked view: each card
  with its score + position + whether it's focused (top-ranked) or dimmed; each filter with score +
  whether to highlight. Read-only — never touches the saved dashboard."
  [dashboard-id intent]
  (let [obs    (dashboard-observations dashboard-id)
        scored (score-relevance intent obs)]
    (if-not scored
      {:dashboard_id dashboard-id :intent intent :available false :cards [] :filters []}
      (let [{:keys [card-scores filter-scores]} scored
            ranked-cards (->> (:cards obs)
                              (map (fn [c] (assoc c :score (get card-scores (:dashcard-id c) 0.0))))
                              (sort-by :score >))
            n-focus      (max 1 (int (Math/ceil (* card-highlight-fraction (count ranked-cards)))))
            focused-ids  (into #{} (map :dashcard-id) (take n-focus ranked-cards))]
        {:dashboard_id dashboard-id
         :intent       intent
         :available    true
         :name         (:name obs)
         :cards        (mapv (fn [c]
                               {:dashcard_id (:dashcard-id c)
                                :card_id     (:card-id c)
                                :tab_id      (:tab-id c)
                                :title       (get-in c [:observation :title])
                                :pos         (:pos c)
                                :score       (:score c)
                                :focused     (contains? focused-ids (:dashcard-id c))})
                             ranked-cards)
         :filters      (mapv (fn [{:keys [name type slug]}]
                               (let [score (get filter-scores slug 0.0)]
                                 {:name name :type type :slug slug :score score
                                  :highlight (>= score filter-highlight-threshold)}))
                             (:filters obs))}))))

(api.macros/defendpoint :post "/dashboard/:id/focus" :- :any
  "Score a dashboard's cards and filters against a stated `intent`, returning a ranked view for the FE to
  re-focus (surface relevant cards, dim the rest, highlight useful filters). Read-only. Body: `{:intent
  \"…\"}`."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [intent]} :- [:map {:closed true} [:intent ms/NonBlankString]]]
  (api/read-check :model/Dashboard id)
  (focus-dashboard id intent))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/dashboard/…` focus routes."
  (api.macros/ns-handler *ns*))
