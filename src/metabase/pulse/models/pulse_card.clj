(ns metabase.pulse.models.pulse-card
  (:require
   [malli.util :as mut]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseCard [_model] :pulse_card)

(doto :model/PulseCard
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

(t2/define-before-insert :model/PulseCard
  [pulse-card]
  (cond-> pulse-card
    (nil? (:position pulse-card)) (assoc :position (pulse.db/next-pulse-card-position-clause (:pulse_id pulse-card)))))

;;; ------------------------------------------------- Persistence Functions -------------------------------------------------

(def NewPulseCard
  "What a caller gives to append a PulseCard, which takes the defaults of its other columns."
  [:map {:closed true}
   [:card_id                            ms/PositiveInt]
   [:pulse_id                           ms/PositiveInt]
   [:dashboard_card_id                  ms/PositiveInt]
   [:position          {:optional true} [:maybe ::pulse.schema/pulse-card.position]]
   [:include_csv       {:optional true} [:maybe :boolean]]
   [:include_xls       {:optional true} [:maybe :boolean]]
   [:format_rows       {:optional true} [:maybe :boolean]]
   [:pivot_results     {:optional true} [:maybe :boolean]]])

;;; ------------------------------------------------------ Writes --------------------------------------------------------

(mu/defn create-pulse-cards! :- [:sequential ::pulse.schema/pulse-card]
  "Insert the PulseCard `rows` and return the inserted instances."
  [rows :- [:sequential ::pulse.schema/pulse-card.create]]
  (if (seq rows)
    (pulse.db/insert-pulse-cards! rows)
    []))

(mu/defn- pulse-cards-to-append :- [:sequential (mut/dissoc ::pulse.schema/pulse-card.update :id)]
  "The rows of the PulseCards of `new-pulse-cards`, with the defaults of a PulseCard; one without a position takes the
  position after the last of its Pulse, which the before-insert hook has the database compute."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls format_rows pivot_results]} new-pulse-cards]
    (cond-> {:card_id           card_id
             :pulse_id          pulse_id
             :dashboard_card_id dashboard_card_id
             :include_csv       (boolean include_csv)
             :include_xls       (boolean include_xls)
             :format_rows       (boolean format_rows)
             :pivot_results     (boolean pivot_results)}
      position (assoc :position position))))

(mu/defn append-pulse-cards! :- [:sequential ::pulse.schema/pulse-card]
  "Create new PulseCards as [[create-pulse-cards!]] does, joining the given card, pulse, and dashboard card and setting
  appropriate defaults for other values if they're not provided."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (if (seq new-pulse-cards)
    (pulse.db/insert-pulse-cards! (vec (pulse-cards-to-append new-pulse-cards)))
    []))

(mu/defn delete-pulse-cards! :- :nil
  "Delete the PulseCards with `ids`, a plain write that publishes nothing."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (pulse.db/delete-pulse-cards! ids))
  nil)

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod app-db-copy/spec :model/PulseCard [_model]
  {:skip? false})

(defmethod change-log/spec :model/PulseCard [_model]
  {:track [:pulse_id :card_id :position :include_csv :include_xls :dashboard_card_id :entity_id :format_rows
           :pivot_results]
   :skip  []})

(defmethod eid-translation/spec :model/PulseCard [_model]
  {:names [:pulse-card]})
