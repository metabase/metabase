(ns metabase.models.pulse-channel
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [clojure.set :as set]
            [medley.core :as m]
            [metabase.models
             [interface :as i]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [user :refer [User]]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

;; ## Static Definitions

(def days-of-week
  "Simple `vector` of the days in the week used for reference and lookups.

   NOTE: order is important here!!
         we use the same ordering as the clj-time `day-of-week` function (1 = Monday, 7 = Sunday) except
         that we are 0 based instead."
  [{:id "mon", :name "Mon"},
   {:id "tue", :name "Tue"},
   {:id "wed", :name "Wed"},
   {:id "thu", :name "Thu"},
   {:id "fri", :name "Fri"},
   {:id "sat", :name "Sat"},
   {:id "sun", :name "Sun"}])

(def ^{:arglists '([day])} day-of-week?
  "Is DAY a valid `day-of-week` choice?"
  (partial contains? (set (map :id days-of-week))))

(defn hour-of-day?
  "Predicate function which returns `true` if the given hour is a valid hour of the day (24 hour), `false` otherwise."
  [hour]
  (and (integer? hour) (<= 0 hour 23)))

(def ^:private schedule-frames
  "Set of possible schedule-frames allowe for a pulse channel."
  #{:first :mid :last})

(defn schedule-frame?
  "Is FRAME a valid schedule frame?"
  [frame]
  (contains? schedule-frames frame))

(def ^:private schedule-types
  "Set of the possible schedule-types allowed for a pulse channel."
  #{:hourly :daily :weekly :monthly})

(defn schedule-type?
  "Predicate function which returns `true` if the given argument is a valid value as a schedule-type, `false` otherwise."
  [schedule-type]
  (contains? schedule-types schedule-type))

(defn valid-schedule?
  "Predicate function which returns `true` if the combination of scheduling choices is valid, `false` otherwise."
  [schedule-type schedule-hour schedule-day schedule-frame]
  (or
    ;; hourly schedule does not care about other inputs
    (= schedule-type :hourly)
    ;; daily schedule requires a valid `hour`
    (and (= schedule-type :daily)
         (hour-of-day? schedule-hour))
    ;; weekly schedule requires a valid `hour` and `day`
    (and (= schedule-type :weekly)
         (hour-of-day? schedule-hour)
         (day-of-week? schedule-day))
    ;; monthly schedule requires a valid `hour` and `frame`.  also a `day` if frame = first or last
    (and (= schedule-type :monthly)
         (schedule-frame? schedule-frame)
         (hour-of-day? schedule-hour)
         (or (contains? #{:first :last} schedule-frame)
             (and (= :mid schedule-frame)
                  (nil? schedule-day))))))

(def channel-types
  "Map which contains the definitions for each type of pulse channel we allow.  Each key is a channel type with a map
   which contains any other relevant information for defining the channel.  E.g.

   {:email {:name \"Email\", :recipients? true}
    :slack {:name \"Slack\", :recipients? false}}"
  {:email {:type              "email"
           :name              "Email"
           :allows_recipients true
           :recipients        ["user", "email"]
           :schedules         [:daily :weekly :monthly]}
   :slack {:type              "slack"
           :name              "Slack"
           :allows_recipients false
           :schedules         [:hourly :daily :weekly :monthly]
           :fields            [{:name "channel"
                                :type "select"
                                :displayName "Post to"
                                :options ["#general"]
                                :required true}]}})

(defn channel-type?
  "Is CHANNEL-TYPE a valid value as a channel type? :tv:"
  [channel-type]
  (contains? (set (keys channel-types)) channel-type))

(defn supports-recipients?
  "Does given CHANNEL type support a list of recipients? :tv:"
  [channel]
  (boolean (:allows_recipients (get channel-types channel))))


;; ## Entity

(models/defmodel PulseChannel :pulse_channel)

(defn ^:hydrate recipients
  "Return the `PulseChannelRecipients` associated with this PULSE-CHANNEL."
  [{:keys [id details]}]
  (into (mapv (partial array-map :email) (:emails details))
        (db/select [User :id :email :first_name :last_name]
          :id [:in {:select [:user_id]
                    :from   [PulseChannelRecipient]
                    :where  [:= :pulse_channel_id id]}])))

(defn- pre-delete [{:keys [id]}]
  (db/delete! PulseChannelRecipient :pulse_channel_id id))

(u/strict-extend (class PulseChannel)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:pulse_channel])
          :types          (constantly {:details :json, :channel_type :keyword, :schedule_type :keyword, :schedule_frame :keyword})
          :properties     (constantly {:timestamped? true})
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  (constantly true)
          :can-write? i/superuser?}))


;; ## Persistence Functions

(defn retrieve-scheduled-channels
  "Fetch all `PulseChannels` that are scheduled to run at a given time described by HOUR, WEEKDAY, MONTHDAY, and MONTHWEEK.

   Examples:
       (retrieve-scheduled-channels 14 \"mon\" :first :first)  -  2pm on the first Monday of the month
       (retrieve-scheduled-channels 8 \"wed\" :other :last)    -  8am on Wednesday of the last week of the month

   Based on the given input the appropriate `PulseChannels` are returned:
     * HOURLY scheduled channels are always included.
     * DAILY scheduled channels are included if the HOUR matches.
     * WEEKLY scheduled channels are included if the WEEKDAY & HOUR match.
     * MONTHLY scheduled channels are included if the MONTHDAY, MONTHWEEK, WEEKDAY, & HOUR all match."
  [hour weekday monthday monthweek]
  {:pre [(or (integer? hour) (nil? hour))
         (or (day-of-week? weekday) (nil? weekday))
         (contains? #{:first :last :mid :other} monthday)
         (contains? #{:first :last :other} monthweek)]}
  (let [schedule-frame              (cond
                                      (= :mid monthday)    "mid"
                                      (= :first monthweek) "first"
                                      (= :last monthweek)  "last"
                                      :else                "invalid")
        monthly-schedule-day-or-nil (when (= :other monthday)
                                      weekday)]
    (db/select [PulseChannel :id :pulse_id :schedule_type :channel_type]
      {:where [:and [:= :enabled true]
                    [:or [:= :schedule_type "hourly"]
                         [:and [:= :schedule_type "daily"]
                               [:= :schedule_hour hour]]
                         [:and [:= :schedule_type "weekly"]
                               [:= :schedule_hour hour]
                               [:= :schedule_day weekday]]
                         [:and [:= :schedule_type "monthly"]
                               [:= :schedule_hour hour]
                               [:= :schedule_frame schedule-frame]
                               [:or [:= :schedule_day weekday]
                                    ;; this is here specifically to allow for cases where day doesn't have to match
                                    [:= :schedule_day monthly-schedule-day-or-nil]]]]]})))


(defn update-recipients!
  "Update the `PulseChannelRecipients` for PULSE-CHANNEL.
   USER-IDS should be a definitive collection of *all* IDs of users who should receive the pulse.

   *  If an ID in USER-IDS has no corresponding existing `PulseChannelRecipients` object, one will be created.
   *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (db/select-field :user_id PulseChannelRecipient, :pulse_channel_id id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %) recipients+)]
        (db/insert-many! PulseChannelRecipient vs)))
    (when (seq recipients-)
      (db/simple-delete! PulseChannelRecipient
        :pulse_channel_id id
        :user_id          [:in recipients-]))))


(defn update-pulse-channel!
  "Updates an existing `PulseChannel` along with all related data associated with the channel such as `PulseChannelRecipients`."
  [{:keys [id channel_type enabled details recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? id)
         (channel-type? channel_type)
         (m/boolean? enabled)
         (schedule-type? schedule_type)
         (valid-schedule? schedule_type schedule_hour schedule_day schedule_frame)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    (db/update! PulseChannel id
      :details        (cond-> details
                        (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
      :enabled        enabled
      :schedule_type  schedule_type
      :schedule_hour  (when (not= schedule_type :hourly)
                        schedule_hour)
      :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                        schedule_day)
      :schedule_frame (when (= schedule_type :monthly)
                        schedule_frame))
    (when (supports-recipients? channel_type)
      (update-recipients! id (or (get recipients-by-type true) [])))))


(defn create-pulse-channel!
  "Create a new `PulseChannel` along with all related data associated with the channel such as `PulseChannelRecipients`."
  [{:keys [channel_type details pulse_id recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(channel-type? channel_type)
         (integer? pulse_id)
         (schedule-type? schedule_type)
         (valid-schedule? schedule_type schedule_hour schedule_day schedule_frame)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        {:keys [id]} (db/insert! PulseChannel
                       :pulse_id       pulse_id
                       :channel_type   channel_type
                       :details        (cond-> details
                                         (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                       :schedule_type  schedule_type
                       :schedule_hour  (when (not= schedule_type :hourly)
                                         schedule_hour)
                       :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                         schedule_day)
                       :schedule_frame (when (= schedule_type :monthly)
                                         schedule_frame))]
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))
    ;; return the id of our newly created channel
    id))


;; don't include `:emails`, we use that purely internally
(add-encoder PulseChannelInstance (fn [pulse-channel json-generator]
                                    (encode-map (m/dissoc-in pulse-channel [:details :emails])
                                                json-generator)))
