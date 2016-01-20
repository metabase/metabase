(ns metabase.models.pulse-channel
  (:require [clojure.set :as set]
            [cheshire.generate :refer [add-encoder encode-map]]
            [korma.core :as k]
            [metabase.db :as db]
            (metabase.models [pulse-channel-recipient :refer [PulseChannelRecipient]]
                             [interface :as i]
                             [user :refer [User]])
            [medley.core :as m]))


;; ## Static Definitions

(def ^:const days-of-week
  "Simple `vector` of the days in the week used for reference and lookups.

   NOTE: order is important here!!
         these indexes match the values from clj-time `day-of-week` function (0 = Sunday, 6 = Saturday)"
  [{:id "sun", :name "Sun"},
   {:id "mon", :name "Mon"},
   {:id "tue", :name "Tue"},
   {:id "wed", :name "Wed"},
   {:id "thu", :name "Thu"},
   {:id "fri", :name "Fri"},
   {:id "sat", :name "Sat"}])

(defn day-of-week?
  "Predicate function which returns `true` if the given day is a valid day-of-week choice, `false` otherwise."
  [day]
  (contains? (set (map :id days-of-week)) day))

(defn hour-of-day?
  "Predicate function which returns `true` if the given hour is a valid hour of the day (24 hour), `false` otherwise."
  [hour]
  (and (integer? hour) (<= 0 hour 23)))

(def ^:const schedule-type-hourly :hourly)
(def ^:const schedule-type-daily :daily)
(def ^:const schedule-type-weekly :weekly)

(def ^:const schedule-types
  "Map which contains the definitions for each type of pulse schedule type we allow.  Each key is a schedule-type with
   a map which contains any other relevant information related to the defined schedule-type.  E.g.

   {:hourly {:name \"Hourly\"}
    :dailye {:name \"Daily\"}}"
  {schedule-type-hourly {}
   schedule-type-daily  {}
   schedule-type-weekly {}})

(defn schedule-type?
  "Predicate function which returns `true` if the given argument is a valid value as a schedule-type, `false` otherwise."
  [schedule-type]
  (contains? (set (keys schedule-types)) schedule-type))

(defn valid-schedule?
  "Predicate function which returns `true` if the combination of scheduling choices is valid, `false` otherwise."
  [schedule-type schedule-hour schedule-day]
  (or
    ;; hourly schedule does not care about other inputs
    (= schedule-type schedule-type-hourly)
    ;; daily schedule requires a valid `hour`
    (and (= schedule-type schedule-type-daily)
         (hour-of-day? schedule-hour))
    ;; weekly schedule requires a valid `hour` and `day`
    (and (= schedule-type schedule-type-weekly)
         (hour-of-day? schedule-hour)
         (day-of-week? schedule-day))))

(def ^:const channel-types
  "Map which contains the definitions for each type of pulse channel we allow.  Each key is a channel type with a map
   which contains any other relevant information for defining the channel.  E.g.

   {:email {:name \"Email\", :recipients? true}
    :slack {:name \"Slack\", :recipients? false}}"
  {:email {:type              "email"
           :name              "Email"
           :allows_recipients true
           :recipients        ["user", "email"]
           :schedules         [schedule-type-daily schedule-type-weekly]}
   :slack {:type              "slack"
           :name              "Slack"
           :allows_recipients false
           :schedules         [schedule-type-hourly schedule-type-daily schedule-type-weekly]
           :fields            [{:name "channel"
                                :type "select"
                                :displayName "Post to"
                                :options ["#general"]
                                :required true}]}})

(defn channel-type?
  "Predicate function which returns `true` if the given argument is a valid value as a channel-type, `false` otherwise."
  [channel-type]
  (contains? (set (keys channel-types)) channel-type))

(defn supports-recipients?
  "Predicate function which returns `true` if the given channel type supports a list of recipients, `false` otherwise."
  [channel]
  (boolean (:allows_recipients (get channel-types channel))))


;; ## Entity

(i/defentity PulseChannel :pulse_channel)

(defn ^:hydrate recipients
  "Return the `PulseChannelRecipients` associated with this PULSE-CHANNEL."
  [{:keys [id creator_id details] :as pulse-channel}]
  (into (mapv (partial array-map :email) (:emails details))
        (db/sel :many [User :id :email :first_name :last_name]
                (k/where {:id [in (k/subselect PulseChannelRecipient (k/fields :user_id) (k/where {:pulse_channel_id id}))]}))))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete PulseChannelRecipient :pulse_channel_id id))

(extend (class PulseChannel)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:pulse_channel])
                    :types              (constantly {:details :json, :channel_type :keyword, :schedule_type :keyword})
                    :timestamped?       (constantly true)
                    :can-read?          (constantly true)
                    :can-write          i/superuser?
                    :pre-cascade-delete pre-cascade-delete}))


;; ## Persistence Functions

(defn retrieve-scheduled-channels
  "Fetch all `PulseChannels` that are scheduled to run given the current hour and day.

   Example:
       (retrieve-scheduled-channels 14 \"mon\")

   Based on the given input the appropriate `PulseChannels` are returned:
     * no input returns any channel scheduled for HOURLY delivery only.
     * just `hour` input returns any HOURLY scheduled channels + DAILY channels for the chosen hour.
     * when `hour` and `day` are supplied we return HOURLY channels + DAILY channels + WEEKLY channels."
  [hour day]
  [:pre [(integer? hour)
         (day-of-week? day)]]
  (k/select PulseChannel
    (k/fields :id :pulse_id :schedule_type :channel_type)
    (k/where (or (= :schedule_type (name schedule-type-hourly))
                 (and (= :schedule_type (name schedule-type-daily))
                      (= :schedule_hour hour))
                 (and (= :schedule_type (name schedule-type-weekly))
                      (= :schedule_hour hour)
                      (= :schedule_day day))))))

(defn update-recipients!
  "Update the `PulseChannelRecipients` for PULSE-CHANNEL.
   USER-IDS should be a definitive collection of *all* IDs of users who should receive the pulse.

   *  If an ID in USER-IDS has no corresponding existing `PulseChannelRecipients` object, one will be created.
   *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (db/sel :many :field [PulseChannelRecipient :user_id] :pulse_channel_id id))
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
  [{:keys [id channel_type details recipients schedule_type schedule_day schedule_hour]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? id)
         (channel-type? channel_type)
         (schedule-type? schedule_type)
         (valid-schedule? schedule_type schedule_hour schedule_day)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    (db/upd PulseChannel id
      :details       (cond-> details
                       (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
      :schedule_type schedule_type
      :schedule_hour (when (not= schedule_type schedule-type-hourly)
                       schedule_hour)
      :schedule_day  (when (= schedule_type schedule-type-weekly)
                       schedule_day))
    (when (supports-recipients? channel_type)
      (update-recipients! id (or (get recipients-by-type true) [])))))

(defn create-pulse-channel
  "Create a new `PulseChannel` along with all related data associated with the channel such as `PulseChannelRecipients`."
  [{:keys [channel_type details pulse_id recipients schedule_type schedule_day schedule_hour]
    :or   {details          {}
           recipients       []}}]
  {:pre [(channel-type? channel_type)
         (integer? pulse_id)
         (schedule-type? schedule_type)
         (valid-schedule? schedule_type schedule_hour schedule_day)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        {:keys [id]} (db/ins PulseChannel
                       :pulse_id         pulse_id
                       :channel_type     channel_type
                       :details          (cond-> details
                                           (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                       :schedule_type    schedule_type
                       :schedule_hour    (when (not= schedule_type schedule-type-hourly)
                                           schedule_hour)
                       :schedule_day     (when (= schedule_type schedule-type-weekly)
                                           schedule_day))]
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))
    ;; return the id of our newly created channel
    id))


;; don't include `:emails`, we use that purely internally
(add-encoder PulseChannelInstance (fn [pulse-channel json-generator]
                                    (encode-map (m/dissoc-in pulse-channel [:details :emails])
                                                json-generator)))
