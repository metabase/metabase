(ns metabase.models.pulse-card
  (:require [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel PulseCard :pulse_card)

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
