(ns metabase.models.pulse-channel
  (:require [clojure.set :as set]
            [korma.core :as k]
            [metabase.api.common :refer [check]]
            [metabase.db :as db]
            (metabase.models [pulse-channel-recipient :refer [PulseChannelRecipient]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))


;; ## Static Definitions

(def ^:const channel-types
  "Map which contains the definitions for each type of pulse channel we allow.  Each key is a channel type with a map
   which contains any other relevant information for defining the channel.  E.g.

   {:email {:name \"Email\", :recipients? true}
    :slack {:name \"Slack\", :recipients? false}}"
  {:email {:recipients? true}
   :slack {:recipients? false}})

(defn channel-type?
  "Predicate function which returns `true` if the given argument is a valid value as a channel-type, `false` otherwise."
  [channel-type]
  (contains? (set (keys channel-types)) (keyword channel-type)))

(def ^:const schedule-types
  "Map which contains the definitions for each type of pulse schedule type we allow.  Each key is a schedule-type with
   a map which contains any other relevant information related to the defined schedule-type.  E.g.

   {:hourly {:name \"Hourly\"}
    :dailye {:name \"Daily\"}}"
  {:hourly {}
   :daily  {}
   :weekly {}})

(defn schedule-type?
  "Predicate function which returns `true` if the given argument is a valid value as a schedule-type, `false` otherwise."
  [schedule-type]
  (contains? (set (keys schedule-types)) (keyword schedule-type)))

(defn supports-recipients?
  "Predicate function which returns `true` if the given channel type supports a list of recipients, `false` otherwise."
  [channel]
  (boolean (:recipients? (get channel-types (keyword channel)))))


(def ^:const days-of-week
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

(def ^:const times-of-day
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
   (types :details :json, :schedule_details :json)
   timestamped]

  (post-select [_ {:keys [id creator_id details] :as pulse-channel}]
    (map->PulseChannelInstance
      (assoc pulse-channel
             ;; don't include `:emails`, we use that purely internally
             :details    (dissoc details :emails)
             ;; here we recombine user details w/ freeform emails
             :recipients (delay (into (mapv (partial array-map :email) (:emails details))
                                      (db/sel :many [User :id :email :first_name :last_name]
                                        (k/where {:id [in (k/subselect PulseChannelRecipient (k/fields :user_id) (k/where {:pulse_channel_id id}))]})))))))

  (pre-cascade-delete [_ {:keys [id]}]
    (db/cascade-delete PulseChannelRecipient :pulse_channel_id id)))

(extend-ICanReadWrite PulseChannelEntity :read :always, :write :superuser)


;; ## Persistence Functions

(defn update-recipients!
  "Update the `PulseChannelRecipients` for PULSE-CHANNEL.
   USER-IDS should be a definitive collection of *all* IDs of users who should receive the pulse.

   *  If an ID in USER-IDS has no corresponding existing `PulseChannelRecipients` object, one will be created.
   *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old     (set (db/sel :many :field [PulseChannelRecipient :user_id] :pulse_channel_id id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %) recipients+)]
        (k/insert PulseChannelRecipient (k/values vs))))
    (when (seq recipients-)
      (k/delete PulseChannelRecipient (k/where {:pulse_channel_id id :user_id [in recipients-]})))))

(defn update-pulse-channel
  "Updates an existing `PulseChannel` along with all related data associated with the channel such as `PulseChannelRecipients`."
  [{:keys [id channel_type details recipients schedule_details schedule_type]
    :or   {details          {}
           recipients       []
           schedule_details {}}}]
  {:pre [(integer? id)
         (channel-type? channel_type)
         (schedule-type? schedule_type)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    (db/upd PulseChannel id
      :details          (cond-> details
                          (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
      :schedule_type    schedule_type
      :schedule_details schedule_details)
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))))

(defn create-pulse-channel
  "Create a new `PulseChannel` along with all related data associated with the channel such as `PulseChannelRecipients`."
  [{:keys [channel_type details pulse_id recipients schedule_details schedule_type]
    :or   {details          {}
           recipients       []
           schedule_details {}}}]
  {:pre [(channel-type? channel_type)
         (integer? pulse_id)
         (schedule-type? schedule_type)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        {:keys [id]} (db/ins PulseChannel
                       :pulse_id         pulse_id
                       :channel_type     channel_type
                       :details          (cond-> details
                                           (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                       :schedule_type    schedule_type
                       :schedule_details schedule_details)]
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))))
