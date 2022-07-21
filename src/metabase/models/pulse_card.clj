(ns metabase.models.pulse-card
  (:require [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel PulseCard :pulse_card)

(u/strict-extend (class PulseCard)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:entity_id true})})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [(serdes.hash/hydrated-hash :pulse) (serdes.hash/hydrated-hash :card)])})

(defn next-position-for
  "Return the next available `pulse_card.position` for the given `pulse`"
  [pulse-id]
  {:pre [(integer? pulse-id)]}
  (-> (db/select-one [PulseCard [:%max.position :max]] :pulse_id pulse-id)
      :max
      (some-> inc)
      (or 0)))

(def ^:private NewPulseCard
  {:card_id                      su/IntGreaterThanZero
   :pulse_id                     su/IntGreaterThanZero
   :dashboard_card_id            su/IntGreaterThanZero
   (s/optional-key :position)    (s/maybe su/NonNegativeInt)
   (s/optional-key :include_csv) (s/maybe s/Bool)
   (s/optional-key :include_xls) (s/maybe s/Bool)})

(s/defn bulk-create!
  "Creates new PulseCards, joining the given card, pulse, and dashboard card and setting appropriate defaults for other
  values if they're not provided."
  [new-pulse-cards :- [NewPulseCard]]
  (db/insert-many! PulseCard
    (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls]} new-pulse-cards]
      {:card_id           card_id
       :pulse_id          pulse_id
       :dashboard_card_id dashboard_card_id
       :position          (u/or-with some? position (next-position-for pulse_id))
       :include_csv       (u/or-with some? include_csv false)
       :include_xls       (u/or-with some? include_xls false)})))

; ----------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes.base/serdes-entity-id "PulseCard" [_ {:keys [position]}]
  (str position))

(defmethod serdes.base/serdes-generate-path "PulseCard"
  [_ {:keys [pulse_id] :as card}]
  [(serdes.base/infer-self-path "Pulse" (db/select-one 'Pulse :id pulse_id))
   (serdes.base/infer-self-path "PulseCard" card)])

(defmethod serdes.base/extract-one "PulseCard"
  [_model-name _opts card]
  (cond-> (serdes.base/extract-one-basics "PulseCard" card)
    true                      (update :card_id            serdes.util/export-fk 'Card)
    true                      (update :pulse_id           serdes.util/export-fk 'Pulse)
    (:dashboard_card_id card) (update :dashboard_card_id  serdes.util/export-fk 'DashboardCard)
    ))

(defmethod serdes.base/load-xform "PulseCard" [card]
  (cond-> (serdes.base/load-xform-basics card)
    true                      (update :card_id            serdes.util/import-fk 'Card)
    true                      (update :pulse_id           serdes.util/import-fk 'Pulse)
    (:dashboard_card_id card) (update :dashboard_card_id  serdes.util/import-fk 'DashboardCard)))

;; TODO Using position as the ID for Pulses is not ideal - better to add an entity_id.
(defmethod serdes.base/load-find-local "PulseCard"
  [path]
  (let [pulse-eid   (-> path first :id)
        pulse       (serdes.base/lookup-by-id 'Pulse pulse-eid)
        position    (-> path last :id)]
    (db/select-one-field :id PulseCard :position position :pulse_id (:id pulse))))

;; Depends on the Pulse, Card and (optional) dashboard card.
(defmethod serdes.base/serdes-dependencies "PulseCard" [{:keys [card_id dashboard_card_id pulse_id]}]
  (let [base [[{:model "Card" :id card_id}]
              [{:model "Pulse" :id pulse_id}]]]
    (if dashboard_card_id
      (conj base [{:model "DashboardCard" :id dashboard_card_id}])
      base)))
;; START HERE: Add entity_id columns to PulseCard, PulseChannel.
