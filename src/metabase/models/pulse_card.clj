(ns metabase.models.pulse-card
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PulseCard [_model] :pulse_card)

(doto :model/PulseCard
  (derive :metabase/model)
  (derive :hook/entity-id))

(defn next-position-for
  "Return the next available `pulse_card.position` for the given `pulse`"
  [pulse-id]
  {:pre [(integer? pulse-id)]}
  (-> (t2/select-one [:model/PulseCard [:%max.position :max]] :pulse_id pulse-id)
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
   [:format_rows       {:optional true} [:maybe :boolean]]
   [:pivot_results     {:optional true} [:maybe :boolean]]])

(mu/defn bulk-create!
  "Creates new PulseCards, joining the given card, pulse, and dashboard card and setting appropriate defaults for other
  values if they're not provided."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (t2/insert! :model/PulseCard
              (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls format_rows pivot_results]} new-pulse-cards]
                {:card_id           card_id
                 :pulse_id          pulse_id
                 :dashboard_card_id dashboard_card_id
                 :position          (u/or-with some? position (next-position-for pulse_id))
                 :include_csv       (boolean include_csv)
                 :include_xls       (boolean include_xls)
                 :format_rows       (boolean format_rows)
                 :pivot_results     (boolean pivot_results)})))
