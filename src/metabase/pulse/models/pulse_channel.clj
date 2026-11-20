(ns metabase.pulse.models.pulse-channel
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.task.send-pulses-trigger :as task.send-pulses-trigger]
   [metabase.pulse.write :as pulse.write]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

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
                                :required    true}]}
   :http  {:type              "http"
           :name              "Webhook"
           :allows_recipients false
           :schedules         [:hourly :daily :weekly :monthly]}})

(defn supports-recipients?
  "Does given `channel` type support a list of recipients? :tv:"
  [channel]
  (boolean (:allows_recipients (get channel-types channel))))

(methodical/defmethod t2/table-name :model/PulseChannel [_model] :pulse_channel)
(methodical/defmethod t2/model-for-automagic-hydration [:default :pulse_channel] [_original-model _k] :model/PulseChannel)

(doto :model/PulseChannel
  (derive :metabase/model)
  (derive :hook/timestamped-on-insert?)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/PulseChannel
  {:details (mi/transform-encrypted-json "pulse_channel.details")
   :channel_type mi/transform-keyword
   :schedule_type mi/transform-keyword
   :schedule_frame mi/transform-keyword})

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

(t2/define-before-insert :model/PulseChannel
  [pulse-channel]
  (pulse.write/check-pulse-channel-schedule pulse-channel)
  (pulse.write/validate-email-domains pulse-channel))

(t2/define-after-insert :model/PulseChannel
  [{:keys [pulse_id id enabled] :as pulse-channel}]
  (events/created! :model/PulseChannel pulse-channel)
  (when enabled
    (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id pulse-channel :add-pc-ids #{id}))
  pulse-channel)

;;; ----------------------------------------------------- Hydration -----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :recipients]
  [_model _k pcs]
  (when (seq pcs)
    (let [pcid->recipients (-> (group-by :pulse_channel_id
                                         (pulse.db/active-recipients-for-channels (map :id pcs)))
                               (update-vals #(map (fn [user] (dissoc user :pulse_channel_id)) %)))]
      (for [pc pcs]
        (assoc pc :recipients (concat
                               (for [email (get-in pc [:details :emails] [])]
                                 {:email email})
                               (get pcid->recipients (:id pc))))))))

;;; ------------------------------------------------ Persistence Functions ------------------------------------------------

(defn update-recipients!
  "Update the `PulseChannelRecipients` for `pulse-CHANNEL`.
  `user-ids` should be a definitive collection of *all* IDs of users who should receive the pulse.

  *  If an ID in `user-ids` has no corresponding existing `PulseChannelRecipients` object, one will be created.
  *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (pulse.db/pulse-channel-recipient-user-ids id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %) recipients+)]
        (pulse.write/create-pulse-channel-recipients! vs)))
    (when (seq recipients-)
      (pulse.write/remove-pulse-channel-recipients! id recipients-))))

(defn update-pulse-channel!
  "Updates an existing `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
  [{:keys [id channel_type enabled details recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? id)
         (m/boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    (pulse.write/update-pulse-channel! id
                                       {:details        (cond-> details
                                                          (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                                        :enabled        enabled
                                        :schedule_type  schedule_type
                                        :schedule_hour  (when (not= schedule_type :hourly)
                                                          schedule_hour)
                                        :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                                          schedule_day)
                                        :schedule_frame (when (= schedule_type :monthly)
                                                          schedule_frame)}
                                       {})
    (when (supports-recipients? channel_type)
      (update-recipients! id (or (get recipients-by-type true) [])))))

(defn create-pulse-channel!
  "Create a new `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
  [{:keys [channel_type channel_id details enabled pulse_id recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? pulse_id)
         (boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        id                 (:id (pulse.write/create-pulse-channel!
                                 {:pulse_id       pulse_id
                                  :channel_type   channel_type
                                  :channel_id     channel_id
                                  :details        (cond-> details
                                                    (supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                                  :enabled        enabled
                                  :schedule_type  schedule_type
                                  :schedule_hour  (when (not= schedule_type :hourly)
                                                    schedule_hour)
                                  :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                                    schedule_day)
                                  :schedule_frame (when (= schedule_type :monthly)
                                                    schedule_frame)}))]
    (when (and (supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))
    ;; return the id of our newly created channel
    id))

(methodical/defmethod mi/to-json :model/PulseChannel
  "Don't include `:emails`, we use that purely internally"
  [pulse-channel json-generator]
  (next-method (m/dissoc-in pulse-channel [:details :emails]) json-generator))

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod events/spec :model/PulseChannel
  [_model]
  {:create :event/pulse-channel-create
   :update :event/pulse-channel-update
   :delete :event/pulse-channel-delete})

(defmethod app-db-copy/spec :model/PulseChannel [_model]
  {:skip? false})

(defmethod change-log/spec :model/PulseChannel [_model]
  {:track [:pulse_id :channel_type :details :schedule_type :schedule_hour :schedule_day :schedule_frame :enabled
           :entity_id :channel_id]
   :skip  []})

(defmethod audit/spec :model/PulseChannel [_model]
  {:track          []
   :track-redacted [:channel_id :channel_type :details :enabled :pulse_id :schedule_day :schedule_frame
                    :schedule_hour :schedule_type]
   :skip           [:entity_id]
   :parent         {:model :model/Pulse, :key :pulse_id}})

(defmethod eid-translation/spec :model/PulseChannel [_model]
  {:names [:pulse-channel]})
