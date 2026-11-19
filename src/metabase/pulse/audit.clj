(ns metabase.pulse.audit
  "What the audit spec of a Pulse and of its parts needs beyond their columns: a write of one of its cards, channels or
  recipients is a write of the Pulse, and the details of its row are those of the Pulse as the database holds it."
  (:require
   [metabase.pulse.db :as pulse.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn create-topic
  "The topic to store for the creation `event` of a Pulse: that of a Dashboard Subscription, or of a legacy Pulse."
  [{:keys [object]}]
  (if (:dashboard_id object)
    :subscription-create
    :pulse-create))

(defn details
  "The details to store for the Pulse `row`: its name, its Dashboard and its parameters, as the database holds them, or
  as the row had them when the `event` has it as its previous row."
  [{:keys [id] :as row} {:keys [previous-object]}]
  (when-let [pulse (pulse.db/pulse id)]
    (cond-> (select-keys pulse [:archived :name :dashboard_id :parameters])
      (identical? row previous-object) (merge (select-keys row [:archived :name :dashboard_id :parameters])))))

(defn state
  "The channels, schedules and recipients that the Pulse `row` has after the write, which an update row stores whole."
  [{:keys [id]} _event]
  (when-let [pulse (some-> (pulse.db/pulse id) (t2/hydrate [:channels :recipients]))]
    (let [channels (:channels pulse)]
      {:channel    (map :channel_type channels)
       :schedule   (map :schedule_type channels)
       :recipients (map :recipients channels)})))
