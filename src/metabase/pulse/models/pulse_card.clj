(ns metabase.pulse.models.pulse-card
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseCard [_model] :pulse_card)

(doto :model/PulseCard
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ------------------------------------------------- Persistence Functions -------------------------------------------------

(defn next-position-for
  "Return the next available `pulse_card.position` for the given `pulse`"
  [pulse-id]
  {:pre [(integer? pulse-id)]}
  (-> (pulse.db/max-pulse-card-position pulse-id)
      :max
      (some-> inc)
      (or 0)))

(def ^:private NewPulseCard
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

(mu/defn create-pulse-cards! :- [:sequential :map]
  "Insert the PulseCard `rows`, publishing their create event, and return the inserted instances."
  [rows :- [:sequential ::pulse.schema/pulse-card.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (u/prog1 (pulse.db/insert-pulse-cards! rows)
        (events/publish-event! :event/pulse-card-create (events/create-event <>))))
    []))

(mu/defn- pulse-cards-to-append :- [:sequential ::pulse.schema/pulse-card.create]
  "The rows of the PulseCards of `new-pulse-cards`, with the defaults of a PulseCard."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (for [{:keys [card_id pulse_id dashboard_card_id position include_csv include_xls format_rows pivot_results]} new-pulse-cards]
    {:card_id           card_id
     :pulse_id          pulse_id
     :dashboard_card_id dashboard_card_id
     :position          (u/or-with some? position (next-position-for pulse_id))
     :include_csv       (boolean include_csv)
     :include_xls       (boolean include_xls)
     :format_rows       (boolean format_rows)
     :pivot_results     (boolean pivot_results)}))

(mu/defn append-pulse-cards! :- [:sequential :map]
  "Create new PulseCards as [[create-pulse-cards!]] does, joining the given card, pulse, and dashboard card and setting
  appropriate defaults for other values if they're not provided."
  [new-pulse-cards :- [:sequential NewPulseCard]]
  (create-pulse-cards! (vec (pulse-cards-to-append new-pulse-cards))))

(mu/defn delete-pulse-cards-for-pulse! :- :boolean
  "Delete the PulseCards of the Pulse with `pulse-id`, publishing their delete event, and return whether there were any."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/with-transaction [_conn]
    (let [rows (pulse.db/pulse-cards-for-pulse pulse-id)]
      (when (seq rows)
        (events/publish-event! :event/pulse-card-delete (events/delete-event rows))
        (pulse.db/delete-pulse-cards-for-pulse! pulse-id))
      (boolean (seq rows)))))

(mu/defn delete-pulse-cards-for-dashcards! :- :nil
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`, publishing their delete event."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (when (seq dashcard-ids)
    (t2/with-transaction [_conn]
      (when-let [rows (not-empty (pulse.db/pulse-cards-for-dashcards dashcard-ids))]
        (events/publish-event! :event/pulse-card-delete (events/delete-event rows))
        (pulse.db/delete-pulse-cards-for-dashcards! dashcard-ids))))
  nil)

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod app-db-copy/spec :model/PulseCard [_model]
  {:skip? false})

(defmethod change-log/spec :model/PulseCard [_model]
  {:track [:pulse_id :card_id :position :include_csv :include_xls :dashboard_card_id :entity_id :format_rows
           :pivot_results]
   :skip  []})

(defmethod audit/spec :model/PulseCard [_model]
  {:track          []
   :track-redacted [:card_id :dashboard_card_id :format_rows :include_csv :include_xls :pivot_results :position
                    :pulse_id]
   :skip           [:entity_id]
   :parent         {:model :model/Pulse, :key :pulse_id}})

(defmethod eid-translation/spec :model/PulseCard [_model]
  {:names [:pulse-card]})
