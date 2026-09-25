(ns metabase.jev.apps.tab-split
  "Split a dashboard into tabs you name. You give a list of tabs — each a name plus an optional description
  of what belongs on it — and Jev assigns every card on the dashboard to the best-fitting tab, with a
  calibrated confidence. The FE previews the reorganization (create the tabs, move the cards, format each
  tab with the focus layout engine) and you Save if you like it.

  This is the bounded-set-assignment primitive again, and it's the version that PLAYS TO Jev's strength:
  YOU supply the tab labels, so Jev only does membership — a `choice` per card over your fixed tab set —
  never open-ended label generation (which it's bad at). The tab descriptions become the `choice` criteria,
  so matching is sharp. Every card is placed at its best match; the confidence rides along so the UI can
  flag shaky assignments for you to fix before saving.

  Read-only itself: it returns an assignment plan. The mutation (create tabs, move cards, save) happens on
  the FE through the normal dashboard edit flow. Prototype scaffolding."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.client :as jev]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Deterministic compression — value-free observation per card
;;; ---------------------------------------------------------------------------------------------------

(defn- column-role
  [{:keys [base_type semantic_type]}]
  (let [bt (some-> base_type keyword)
        st (some-> semantic_type keyword)]
    (cond
      (isa? st :type/Latitude)  :geo
      (isa? st :type/Longitude) :geo
      (isa? bt :type/Temporal)  :temporal
      (isa? bt :type/Number)    :numeric
      :else                     :text)))

(defn- describe-card
  "A compact, value-free English description of a card for Jev to match against a tab: title, description,
  chart type, and the roles of its first few columns. No row data."
  [card]
  (let [cols (take 6 (:result_metadata card))]
    (str "\"" (:name card) "\""
         (when-let [d (not-empty (:description card))] (str " — " d))
         (when (seq cols)
           (str " [" (str/join ", " (map (fn [c] (str (:name c) " (" (name (column-role c)) ")")) cols)) "]"))
         (when-let [chart (some-> (:display card) name)] (str " shown as a " chart)))))

(defn- dashboard-cards
  "The dashcards of `dashboard-id`, each carrying its grid position. Query cards (with a `card_id`) get a
  compressed description for Jev; text/heading cards (no `card_id`) carry no description — they'll be
  placed by proximity, travelling with the cards they sit above."
  [dashboard-id]
  (let [cards (t2/select-pk->fn identity :model/Card
                                :id [:in (keep :card_id (t2/select [:model/DashboardCard :card_id]
                                                                   :dashboard_id dashboard-id))])]
    (->> (t2/select :model/DashboardCard :dashboard_id dashboard-id)
         (mapv (fn [dc]
                 (let [card (get cards (:card_id dc))]
                   {:dashcard-id (:id dc)
                    :card-id     (:card_id dc)
                    :pos         (select-keys dc [:row :col :size_x :size_y])
                    :query?      (some? (:card_id dc))
                    :title       (:name card)
                    :description (when card (describe-card card))}))))))

(defn- assign-text-cards-by-proximity
  "Text/heading cards have no query for Jev to judge, but they head a section — so each should travel with
  the cards it sits above. For each text card, inherit the tab of the nearest assigned query card BELOW it
  (overlapping columns, smallest row gap); fall back to the nearest by grid distance, else tab 0. Returns
  a {dashcard-id {:tab_index i :by_proximity true}} map for the text cards."
  [cards query-assignments]
  (let [assigned (keep (fn [c]
                         (when-let [a (get query-assignments (:dashcard-id c))]
                           (when (:tab_index a) (assoc c :tab_index (:tab_index a)))))
                       cards)
        col-overlap? (fn [a b]
                       (let [ac (get-in a [:pos :col]) aw (get-in a [:pos :size_x])
                             bc (get-in b [:pos :col]) bw (get-in b [:pos :size_x])]
                         (and ac aw bc bw (< ac (+ bc bw)) (< bc (+ ac aw)))))
        nearest-tab (fn [text-card]
                      (let [tr (get-in text-card [:pos :row])
                            below (->> assigned
                                       (filter #(and (col-overlap? text-card %)
                                                     (>= (get-in % [:pos :row]) tr)))
                                       (sort-by #(get-in % [:pos :row])))
                            fallback (->> assigned
                                          (sort-by #(abs (long (- (get-in % [:pos :row]) tr)))))]
                        (:tab_index (or (first below) (first fallback)))))]
    (into {}
          (comp (remove :query?)
                (map (fn [tc]
                       [(:dashcard-id tc) {:tab_index (or (nearest-tab tc) 0) :by_proximity true}])))
          cards)))

;;; ---------------------------------------------------------------------------------------------------
;;; Jev assignment — one parallel `choice` per card over the named tabs
;;; ---------------------------------------------------------------------------------------------------

(defn- tab-criteria
  "The `choice` criteria map: tab-key -> the tab's description (falling back to its name). Jev picks one
  key per card. Keys are stringified indices so tab names can be anything."
  [tabs]
  (into {} (map-indexed (fn [i {:keys [name description]}]
                          [(keyword (str i)) (str name (when (not-empty description) (str ": " description)))]))
        tabs))

(defn- assign-cards
  "Assign the QUERY cards to a tab in ONE parallel Jev request: a `choice` over the named tabs per card,
  fed the card's description. (Text cards are placed by proximity, not here.) Returns
  `{dashcard-id {:tab_index i :confidence c}}` or nil on Jev failure."
  [tabs cards]
  (let [criteria (tab-criteria tabs)
        query-cards (filter :query? cards)
        state    {:tabs (mapv (fn [{:keys [name description]}]
                                (str name (when (not-empty description) (str ": " description)))) tabs)}
        questions (into {}
                        (map (fn [{:keys [dashcard-id description]}]
                               [(keyword "card" (str dashcard-id))
                                (jev/choice (str "Which tab does this dashboard card belong on? " description)
                                            criteria)]))
                        query-cards)
        result   (jev/ask state questions)]
    (when (:ok result)
      (let [answers (:answers result)]
        (into {}
              (map (fn [{:keys [dashcard-id]}]
                     (let [answer (get answers (keyword "card" (str dashcard-id)))
                           choice (:choice answer)]
                       [dashcard-id {:tab_index  (when choice (parse-long (name (keyword choice))))
                                     :confidence (:confidence answer)}])))
              query-cards)))))

;;; ---------------------------------------------------------------------------------------------------
;;; Endpoint
;;; ---------------------------------------------------------------------------------------------------

(defn split-dashboard
  "Assign `dashboard-id`'s cards to the named `tabs`. Returns a plan: the tabs, and per card its assigned
  tab index + Jev confidence, for the FE to preview (create tabs, move cards) and Save. Read-only."
  [dashboard-id tabs]
  (api/read-check :model/Dashboard dashboard-id)
  (let [cards (dashboard-cards dashboard-id)]
    (if-not (jev/key-present?)
      {:dashboard_id dashboard-id :jev_available false :tabs tabs :assignments []}
      (let [started     (System/nanoTime)
            query-assigns (assign-cards tabs cards)
            text-assigns  (assign-text-cards-by-proximity cards query-assigns)
            assignments   (merge query-assigns text-assigns)]
        {:dashboard_id dashboard-id
         :jev_available true
         :tabs         (vec tabs)
         :assignments  (mapv (fn [{:keys [dashcard-id card-id title query?]}]
                               (let [a (get assignments dashcard-id)]
                                 {:dashcard_id  dashcard-id
                                  :card_id      card-id
                                  :title        title
                                  :is_text      (not query?)
                                  :tab_index    (:tab_index a)
                                  :confidence   (:confidence a)
                                  :by_proximity (boolean (:by_proximity a))}))
                             cards)
         :elapsed_ms   (/ (- (System/nanoTime) started) 1e6)}))))

(api.macros/defendpoint :post "/dashboard/:id/split-into-tabs" :- :any
  "Assign a dashboard's cards to a list of tabs you name. Body: `{:tabs [{:name \"…\" :description \"…\"?} …]}`.
  Returns an assignment plan (per card: its tab index + Jev's confidence) for the FE to preview and Save.
  Jev only does membership — the tab labels are yours — so it plays to its strength. Read-only. Prototype."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [tabs]} :- [:map {:closed true}
                      [:tabs [:sequential {:min 1}
                              [:map {:closed true}
                               [:name ms/NonBlankString]
                               [:description {:optional true} [:maybe :string]]]]]]]
  (split-dashboard id tabs))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/dashboard/:id/split-into-tabs` route."
  (api.macros/ns-handler *ns*))
