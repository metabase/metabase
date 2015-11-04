(ns metabase.models.pulse-channel
  (:require [clojure.set :as set]
            [korma.core :as k]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [pulse-channel-recipient :refer [PulseChannelRecipient]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))


;; ## Static Definitions

(def channel-types
  "Map which contains the definitions for each type of pulse channel we allow.  Each key is a channel type with a map
   which contains any other relevant information for defining the channel.  E.g.

   {:email {:name \"Email\"}
    :slack {:name \"Slack\"}}"
  {:email {}
   :slack {}})

(defn pulse-channel?
  "Predicate function which returns `true` if the given channel is a valid option as a pulse channel type, `false` otherwise."
  [channel]
  (contains? (set (keys channel-types)) (keyword channel)))

(def modes
  {:active   {:id 1
              :name "Active"}
   :disabled {:id 2
              :name "Disabled"}})

(def mode-kws
  (set (keys modes)))

(defn mode->id [mode]
  {:pre [(contains? mode-kws mode)]}
  (:id (modes mode)))

(defn mode->name [mode]
  {:pre [(contains? mode-kws mode)]}
  (:name (modes mode)))

(def modes-input
  [{:id (mode->id :active),   :name (mode->name :active)}
   {:id (mode->id :disabled), :name (mode->name :disabled)}])

(def days-of-week
  "Simple `vector` of the days in the week used for reference and lookups.

   NOTE: order is important here!!
         these indexes match the values from clj-time `day-of-week` function (0 = Sunday, 6 = Saturday)"
  [{:id "sun" :name "Sun"},
   {:id "mon" :name "Mon"},
   {:id "tue" :name "Tue"},
   {:id "wed" :name "Wed"},
   {:id "thu" :name "Thu"},
   {:id "fri" :name "Fri"},
   {:id "sat" :name "Sat"}])

(def times-of-day
  [{:id "morning" :name "Morning" :realhour 8},
   {:id "midday" :name "Midday" :realhour 12},
   {:id "afternoon" :name "Afternoon" :realhour 16},
   {:id "evening" :name "Evening" :realhour 20},
   {:id "midnight" :name "Midnight" :realhour 0}])

(defn time-of-day->realhour
  "Time-of-day to realhour"
  [time-of-day]
  (-> (filter #(= time-of-day (:id %)) times-of-day)
      first
      :realhour))


;; ## Entity

(defrecord PulseChannelInstance []
  ;; preserve normal IFn behavior so things like ((sel :one Database) :id) work correctly
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite PulseChannelInstance :read :always, :write :superuser)

(defentity PulseChannel
  [(k/table :pulse_channel)
   (hydration-keys pulse_channel)
   (types :schedule_details :json)
   timestamped]

  (post-select [_ {:keys [id creator_id] :as pulse-channel}]
    (map->PulseChannelInstance
      (u/assoc* pulse-channel
                :recipients   (delay (sel :many User
                                          (k/where {:id [in (k/subselect PulseChannelRecipient (k/fields :user_id) (k/where {:pulse_channel_id id}))]}))))))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete PulseChannelRecipient :pulse_channel_id id)))

(extend-ICanReadWrite PulseChannelEntity :read :always, :write :superuser)


;; ## Related Functions

(defn update-recipients
  "Update the `PulseChannelRecipients` for PULSE.
   USER-IDS should be a definitive collection of *all* IDs of users who should receive the pulse.

   *  If an ID in USER-IDS has no corresponding existing `PulseChannelRecipients` object, one will be created.
   *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  {:arglists '([pulse-channel user-ids])}
  [{:keys [id]} user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (sel :many :field [PulseChannelRecipient :user_id] :pulse_channel_id id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %)
                    recipients+)]
        (k/insert PulseChannelRecipient
                (k/values vs))))
    (when (seq recipients-)
      (k/delete PulseChannelRecipient
              (k/where {:pulse_channel_id id
                      :user_id [in recipients-]})))))
