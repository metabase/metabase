(ns metabase.models.pulse-card
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel PulseCard :pulse_card)

(mi/define-methods
 PulseCard
 {:properties (constantly {::mi/entity-id true})})

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
  {:card_id                      su/IntGreaterThanZero
   :pulse_id                     su/IntGreaterThanZero
   :dashboard_card_id            su/IntGreaterThanZero
   (s/optional-key :position)    (s/maybe su/IntGreaterThanOrEqualToZero)
   (s/optional-key :include_csv) (s/maybe s/Bool)
   (s/optional-key :include_xls) (s/maybe s/Bool)})

(s/defn bulk-create!
  "Creates new PulseCards, joining the given card, pulse, and dashboard card and setting appropriate defaults for other
  values if they're not provided."
  [new-pulse-cards :- [NewPulseCard]]
  (t2/insert! PulseCard
    (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls]} new-pulse-cards]
      {:card_id           card_id
       :pulse_id          pulse_id
       :dashboard_card_id dashboard_card_id
       :position          (u/or-with some? position (next-position-for pulse_id))
       :include_csv       (u/or-with some? include_csv false)
       :include_xls       (u/or-with some? include_xls false)})))

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
