(ns metabase.models.pulse-channel
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.serialization :as serdes]
   [metabase.models.user :as user :refer [User]]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan.models :as models]
   [toucan2.core :as t2]))

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
  "Is `day` a valid `day-of-week` choice?"
  (partial contains? (set (map :id days-of-week))))

(defn hour-of-day?
  "Is `hour` is a valid hour of the day (24 hour)?"
  [hour]
  (and (integer? hour) (<= 0 hour 23)))

(def ^:private schedule-frames
  "Set of possible schedule-frames allow for a PulseChannel."
  #{:first :mid :last})

(defn schedule-frame?
  "Is `frame` a valid schedule frame?"
  [frame]
  (contains? schedule-frames frame))

(def ^:private schedule-types
  "Set of the possible schedule-types allowed for a PulseChannel."
  #{:hourly :daily :weekly :monthly})

(defn schedule-type?
  "Is `schedule-type` a valid PulseChannel schedule type?"
  [schedule-type]
  (contains? schedule-types schedule-type))

(defn valid-schedule?
  "Is this combination of scheduling choices valid?"
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
           :recipients        ["user" "email"]
           :schedules         [:hourly :daily :weekly :monthly]}
   :slack {:type              "slack"
           :name              "Slack"
           :allows_recipients false
           :schedules         [:hourly :daily :weekly :monthly]
           :fields            [{:name        "channel"
                                :type        "select"
                                :displayName "Post to"
                                :options     []
                                :required    true}]}})

(defn channel-type?
  "Is `channel-type` a valid value as a channel type? :tv:"
  [channel-type]
  (contains? (set (keys channel-types)) channel-type))

(defn supports-recipients?
  "Does given `channel` type support a list of recipients? :tv:"
  [channel]
  (boolean (:allows_recipients (get channel-types channel))))


;; ## Entity

(models/defmodel PulseChannel :pulse_channel)

(doto PulseChannel
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(mi/define-simple-hydration-method recipients
  :recipients
  "Return the `PulseChannelRecipients` associated with this `pulse-channel`."
  [{pulse-channel-id :id, {:keys [emails]} :details}]
  (concat
   (for [email emails]
     {:email email})
   (t2/select
    [User :id :email :first_name :last_name]
    {:select    [:u.id :u.email :u.first_name :u.last_name]
     :from      [[:core_user :u]]
     :left-join [[:pulse_channel_recipient :pcr] [:= :u.id :pcr.user_id]]
     :where     [:and
                 [:= :pcr.pulse_channel_id pulse-channel-id]
                 [:= :u.is_active true]]
     :order-by [[:u.id :asc]]})))

(def ^:dynamic *archive-parent-pulse-when-last-channel-is-deleted*
  "Should we automatically archive a Pulse when its last `PulseChannel` is deleted? Normally we do, but this is disabled
  in [[update-notification-channels!]] which creates/deletes/updates several channels sequentially."
  true)

(defn- pre-delete
  "This function is called by [[metabase.models.pulse-channel/pre-delete]] when the `PulseChannel` is about to be
  deleted. Archives `Pulse` if the channel being deleted is its last channel."
  [{pulse-id :pulse_id, pulse-channel-id :id}]
  (when *archive-parent-pulse-when-last-channel-is-deleted*
    (let [other-channels-count (t2/count PulseChannel :pulse_id pulse-id, :id [:not= pulse-channel-id])]
      (when (zero? other-channels-count)
        (t2/update! :metabase.models.pulse/Pulse pulse-id {:archived true})))))

;; we want to load this at the top level so the Setting the namespace defines gets loaded
(def ^:private ^{:arglists '([email-addresses])} validate-email-domains*
  (or (u/ignore-exceptions
        (classloader/require 'metabase-enterprise.advanced-config.models.pulse-channel)
        (resolve 'metabase-enterprise.advanced-config.models.pulse-channel/validate-email-domains))
      (constantly nil)))

(defn validate-email-domains
  "For channels that are being sent to raw email addresses: check that the domains in the emails are allowed by
  the [[metabase-enterprise.advanced-config.models.pulse-channel/subscription-allowed-domains]] Setting, if set. This
  will no-op if `subscription-allowed-domains` is unset or if we do not have a premium token with the
  `:advanced-config` feature."
  [{{:keys [emails]} :details, :keys [recipients], :as pulse-channel}]
  ;; Raw email addresses can be in either `[:details :emails]` or in `:recipients`, depending on who is invoking this
  ;; function. Make sure we handle both situations.
  ;;
  ;;    {:details {:emails [\"email@example.com\" ...]}}
  ;;
  ;;  The Dashboard Subscription FE currently sends raw email address recipients in this format:
  ;;
  ;;    {:recipients [{:email \"email@example.com\"} ...]}
  ;;
  (u/prog1 pulse-channel
    (let [raw-email-recipients (remove :id recipients)
          user-recipients      (filter :id recipients)
          emails               (concat emails (map :email raw-email-recipients))]
      (validate-email-domains* emails)
      ;; validate User `:id` & `:email` match up for User recipients. This is mostly to make sure people don't try to
      ;; be sneaky and pass in a valid User ID but different email so they can send test Pulses out to arbitrary email
      ;; addresses
      (when-let [user-ids (not-empty (into #{} (comp (filter some?) (map :id)) user-recipients))]
        (let [user-id->email (t2/select-pk->fn :email User, :id [:in user-ids])]
          (doseq [{:keys [id email]} user-recipients
                  :let               [correct-email (get user-id->email id)]]
            (when-not correct-email
              (throw (ex-info (tru "User {0} does not exist." id)
                              {:status-code 404})))
            ;; only validate the email address if it was explicitly specified, which is not explicitly required.
            (when (and email
                       (not= email correct-email))
              (throw (ex-info (tru "Wrong email address for User {0}." id)
                              {:status-code 403})))))))))

(mi/define-methods
 PulseChannel
 {:hydration-keys (constantly [:pulse_channel])
  :types          (constantly {:details        :json
                               :channel_type   :keyword
                               :schedule_type  :keyword
                               :schedule_frame :keyword})
  :properties     (constantly {::mi/timestamped? true
                               ::mi/entity-id    true})
  :pre-delete     pre-delete
  :pre-insert     validate-email-domains
  :pre-update     validate-email-domains})

(defmethod serdes/hash-fields PulseChannel
  [_pulse-channel]
  [(serdes/hydrated-hash :pulse) :channel_type :details :created_at])

;; ## Persistence Functions

(s/defn retrieve-scheduled-channels
  "Fetch all `PulseChannels` that are scheduled to run at a given time described by `hour`, `weekday`, `monthday`, and
  `monthweek`.

  Examples:

    (retrieve-scheduled-channels 14 \"mon\" :first :first)  -  2pm on the first Monday of the month
    (retrieve-scheduled-channels 8 \"wed\" :other :last)    -  8am on Wednesday of the last week of the month

  Based on the given input the appropriate `PulseChannels` are returned:

  *  `hourly` scheduled channels are always included.
  *  `daily` scheduled channels are included if the `hour` matches.
  *  `weekly` scheduled channels are included if the `weekday` & `hour` match.
  *  `monthly` scheduled channels are included if the `monthday`, `monthweek`, `weekday`, & `hour` all match."
  [hour      :- (s/maybe s/Int)
   weekday   :- (s/maybe (s/pred day-of-week?))
   monthday  :-  (s/enum :first :last :mid :other)
   monthweek :- (s/enum :first :last :other)]
  (let [schedule-frame              (cond
                                      (= :mid monthday)    "mid"
                                      (= :first monthweek) "first"
                                      (= :last monthweek)  "last"
                                      :else                "invalid")
        monthly-schedule-day-or-nil (when (= :other monthday)
                                      weekday)]
    (t2/select [PulseChannel :id :pulse_id :schedule_type :channel_type]
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
  "Update the `PulseChannelRecipients` for `pulse-CHANNEL`.
  `user-ids` should be a definitive collection of *all* IDs of users who should receive the pulse.

  *  If an ID in `user-ids` has no corresponding existing `PulseChannelRecipients` object, one will be created.
  *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (t2/select-fn-set :user_id PulseChannelRecipient, :pulse_channel_id id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %) recipients+)]
        (t2/insert! PulseChannelRecipient vs)))
    (when (seq recipients-)
      (t2/delete! (t2/table-name PulseChannelRecipient)
        :pulse_channel_id id
        :user_id          [:in recipients-]))))


(defn update-pulse-channel!
  "Updates an existing `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
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
    (t2/update! PulseChannel id
                {:details        (cond-> details
                                   (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                 :enabled        enabled
                 :schedule_type  schedule_type
                 :schedule_hour  (when (not= schedule_type :hourly)
                                   schedule_hour)
                 :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                   schedule_day)
                 :schedule_frame (when (= schedule_type :monthly)
                                   schedule_frame)})
    (when (supports-recipients? channel_type)
      (update-recipients! id (or (get recipients-by-type true) [])))))


(defn create-pulse-channel!
  "Create a new `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
  [{:keys [channel_type details enabled pulse_id recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(channel-type? channel_type)
         (integer? pulse_id)
         (boolean? enabled)
         (schedule-type? schedule_type)
         (valid-schedule? schedule_type schedule_hour schedule_day schedule_frame)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        {:keys [id]}       (first (t2/insert-returning-instances!
                                    PulseChannel
                                    :pulse_id       pulse_id
                                    :channel_type   channel_type
                                    :details        (cond-> details
                                                      (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                                    :enabled        enabled
                                    :schedule_type  schedule_type
                                    :schedule_hour  (when (not= schedule_type :hourly)
                                                      schedule_hour)
                                    :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                                      schedule_day)
                                    :schedule_frame (when (= schedule_type :monthly)
                                                      schedule_frame)))]
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))
    ;; return the id of our newly created channel
    id))

(methodical/defmethod mi/to-json PulseChannel
  "Don't include `:emails`, we use that purely internally"
  [pulse-channel json-generator]
  (next-method (m/dissoc-in pulse-channel [:details :emails]) json-generator))

; ----------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/generate-path "PulseChannel"
  [_ {:keys [pulse_id] :as channel}]
  [(serdes/infer-self-path "Pulse" (t2/select-one 'Pulse :id pulse_id))
   (serdes/infer-self-path "PulseChannel" channel)])

(defmethod serdes/extract-one "PulseChannel"
  [_model-name _opts channel]
  (let [recipients (mapv :email (mdb.query/query {:select [:user.email]
                                                  :from   [[:pulse_channel_recipient :pcr]]
                                                  :join   [[:core_user :user] [:= :user.id :pcr.user_id]]
                                                  :where  [:= :pcr.pulse_channel_id (:id channel)]}))]
    (-> (serdes/extract-one-basics "PulseChannel" channel)
        (update :pulse_id   serdes/*export-fk* 'Pulse)
        (assoc  :recipients recipients))))

(defmethod serdes/load-xform "PulseChannel" [channel]
  (-> channel
      serdes/load-xform-basics
      (update :pulse_id serdes/*import-fk* 'Pulse)))

(defn- import-recipients [channel-id emails]
  (let [incoming-users (set (for [email emails
                                  :let [id (t2/select-one-pk 'User :email email)]]
                              (or id
                                  (:id (user/serdes-synthesize-user! {:email email})))))
        current-users  (set (t2/select-fn-set :user_id PulseChannelRecipient :pulse_channel_id channel-id))
        combined       (set/union incoming-users current-users)]
    (when-not (empty? combined)
      (update-recipients! channel-id combined))))

;; Customized load-insert! and load-update! to handle the embedded recipients field - it's really a separate table.
(defmethod serdes/load-insert! "PulseChannel" [_ ingested]
  (let [;; Call through to the default load-insert!
        chan ((get-method serdes/load-insert! "") "PulseChannel" (dissoc ingested :recipients))]
    (import-recipients (:id chan) (:recipients ingested))
    chan))

(defmethod serdes/load-update! "PulseChannel" [_ ingested local]
  ;; Call through to the default load-update!
  (let [chan ((get-method serdes/load-update! "") "PulseChannel" (dissoc ingested :recipients) local)]
    (import-recipients (:id local) (:recipients ingested))
    chan))

;; Depends on the Pulse.
(defmethod serdes/dependencies "PulseChannel" [{:keys [pulse_id]}]
  [[{:model "Pulse" :id pulse_id}]])
