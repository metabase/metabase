(ns metabase.pulse.audit
  "What the audit spec of a Pulse and of its parts needs beyond their columns: an Alert and a Dashboard Subscription are
  both Pulses, a write of one of its cards, channels or recipients is a write of the Pulse, and the details of its row
  are those of the Pulse as the database holds it."
  (:require
   [metabase.pulse.db :as pulse.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- row-of
  "The Pulse that the lifecycle `event` is about."
  [{:keys [object previous-object]}]
  (or object previous-object))

(defn- alert?
  "Whether the Pulse of the lifecycle `event` is an Alert."
  [event]
  (some? (:alert_condition (row-of event))))

(defn create-topic
  "The topic to store for the creation `event` of a Pulse, nil for that of an Alert."
  [event]
  (when-not (alert? event)
    (if (:dashboard_id (row-of event))
      :subscription-create
      :pulse-create)))

(defn update-topic
  "The topic to store for the update `event` of a Pulse, or of its parts."
  [event]
  (if (alert? event)
    :alert-update
    :subscription-update))

(defn subject
  "The `[model id]` under which the row of the Pulse `event` is recorded: the Pulse, or its Card when it is an Alert."
  [event]
  [(if (alert? event) :model/Card :model/Pulse) (:id (row-of event))])

(defn- details-map
  "The details of the loaded Pulse `pulse`, named `pulse-name`, whose `parent-key` holds `parent-id`."
  [pulse pulse-name parent-key parent-id]
  (let [channels (:channels pulse)]
    {:archived   (:archived pulse)
     :name       pulse-name
     parent-key  parent-id
     :parameters (:parameters pulse)
     :channel    (map :channel_type channels)
     :schedule   (map :schedule_type channels)
     :recipients (map :recipients channels)}))

(defn details
  "The details to store for the Pulse `row`: its name, its Dashboard or the Card of an Alert, its parameters, and the
  channels, schedules and recipients it has."
  [{:keys [id alert_condition]} _event]
  (if (some? alert_condition)
    (when-let [alert (some-> (pulse.db/alert id) (t2/hydrate :cards [:channels :recipients]))]
      (let [card (first (:cards alert))]
        (details-map alert (:name card) :card_id (:id card))))
    (when-let [pulse (some-> (pulse.db/pulse id) (t2/hydrate :cards [:channels :recipients]))]
      (details-map pulse (:name pulse) :dashboard_id (:dashboard_id pulse)))))
