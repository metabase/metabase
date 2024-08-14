(ns metabase.models.pulse-card
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def PulseCard
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/PulseCard)

(methodical/defmethod t2/table-name :model/PulseCard [_model] :pulse_card)

(doto :model/PulseCard
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/hash-fields PulseCard
  [_pulse-card]
  [(serdes/hydrated-hash :pulse)
   (serdes/hydrated-hash :card)
   :position])

(defn next-position-for
  "Return the next available `pulse_card.position` for the given `pulse`"
  [pulse-id]
  {:pre [(integer? pulse-id)]}
  (-> (t2/select-one [PulseCard [:%max.position :max]] :pulse_id pulse-id)
      :max
      (some-> inc)
      (or 0)))

(def ^:private NewPulseCard
 [:map {:closed true}
  [:card_id                            ms/PositiveInt]
  [:pulse_id                           ms/PositiveInt]
  [:dashboard_card_id                  ms/PositiveInt]
  [:position          {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
  [:include_csv       {:optional true} [:maybe :boolean]]
  [:include_xls       {:optional true} [:maybe :boolean]]
  [:format_rows       {:optional true} [:maybe :boolean]]])

(mu/defn bulk-create!
  "Creates new PulseCards, joining the given card, pulse, and dashboard card and setting appropriate defaults for other
  values if they're not provided."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (t2/insert! PulseCard
    (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls format_rows]} new-pulse-cards]
      {:card_id           card_id
       :pulse_id          pulse_id
       :dashboard_card_id dashboard_card_id
       :position          (u/or-with some? position (next-position-for pulse_id))
       :include_csv       (boolean include_csv)
       :include_xls       (boolean include_xls)
       :format_rows       (boolean format_rows)})))

; ----------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/generate-path "PulseCard"
  [_ {:keys [pulse_id] :as card}]
  [(serdes/infer-self-path "Pulse" (t2/select-one 'Pulse :id pulse_id))
   (serdes/infer-self-path "PulseCard" card)])

(defmethod serdes/extract-one "PulseCard"
  [_model-name _opts card]
  (cond-> (serdes/extract-one-basics "PulseCard" card)
    true                      (update :card_id            serdes/*export-fk* 'Card)
    true                      (update :pulse_id           serdes/*export-fk* 'Pulse)
    (:dashboard_card_id card) (update :dashboard_card_id  serdes/*export-fk* 'DashboardCard)))

(defmethod serdes/load-xform "PulseCard" [card]
  (cond-> (serdes/load-xform-basics card)
    true                      (update :card_id            serdes/*import-fk* 'Card)
    true                      (update :pulse_id           serdes/*import-fk* 'Pulse)
    true                      (dissoc :dashboard_id)
    (:dashboard_card_id card) (update :dashboard_card_id  serdes/*import-fk* 'DashboardCard)))

;; Depends on the Pulse, Card and (optional) dashboard card.
(defmethod serdes/dependencies "PulseCard" [{:keys [card_id dashboard_card_id pulse_id]}]
  (let [base [[{:model "Card" :id card_id}]
              [{:model "Pulse" :id pulse_id}]]]
    (if-let [[dash-id _] dashboard_card_id]
      (conj base [{:model "Dashboard" :id dash-id}])
      base)))
