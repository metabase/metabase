(ns metabase.pulse.models.pulse-channel
  (:require
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as notification.models]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.pulse.task.send-pulses-trigger :as task.send-pulses-trigger]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/PulseChannel
  {:details (mi/transform-encrypted-json "pulse_channel.details")
   :channel_type mi/transform-keyword
   :schedule_type mi/transform-keyword
   :schedule_frame mi/transform-keyword})

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

(defn validate-email-domains
  "For channels that are being sent to raw email addresses: check that the domains in the emails are allowed by
  the [[metabase-enterprise.advanced-config.settings/subscription-allowed-domains]] Setting, if set. This will no-op
  if `subscription-allowed-domains` is unset or if we do not have a premium token with the `:advanced-config`
  feature."
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
      (notification.models/validate-email-domains! emails)
      ;; validate User `:id` & `:email` match up for User recipients. This is mostly to make sure people don't try to
      ;; be sneaky and pass in a valid User ID but different email so they can send test Pulses out to arbitrary email
      ;; addresses
      (when-let [user-ids (not-empty (into #{} (comp (filter some?) (map :id)) user-recipients))]
        (let [user-id->email (pulse.db/user-emails-by-id user-ids)]
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

(def ^:private schedule-columns
  "The columns that decide when a PulseChannel is sent."
  #{:schedule_type :schedule_hour :schedule_day :schedule_frame})

(defn- check-details-emails
  "Throws unless the raw email addresses in the `:details` of `pulse-channel` are allowed by the
  [[metabase-enterprise.advanced-config.settings/subscription-allowed-domains]] Setting."
  [{{:keys [emails]} :details :as pulse-channel}]
  (u/prog1 pulse-channel
    (notification.models/validate-email-domains! (or emails []))))

(t2/define-before-insert :model/PulseChannel
  [pulse-channel]
  (pulse.schema/check-schedule (merge (zipmap schedule-columns (repeat nil)) pulse-channel))
  (check-details-emails pulse-channel))

(t2/define-before-update :model/PulseChannel
  [pulse-channel]
  (let [changes (t2/changes pulse-channel)]
    (when (some #(contains? changes %) schedule-columns)
      (pulse.schema/check-schedule pulse-channel))
    (when (contains? changes :details)
      (check-details-emails pulse-channel)))
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

;;; ------------------------------------------------------ Writes --------------------------------------------------------

(defn- trigger-group-key
  "The pulse id and schedule that decide which SendPulse trigger a PulseChannel belongs to."
  [{:keys [pulse_id] :as pulse-channel}]
  [pulse_id (update-vals (select-keys pulse-channel schedule-columns) #(if (keyword? %) (name %) %))])

(defn- update-triggers!
  "Add the `channels` to, or remove them from, their SendPulse triggers, one update per pulse and schedule. `op` is
  `:add-pc-ids` or `:remove-pc-ids`."
  [op channels]
  (doseq [[[pulse-id schedule] group] (group-by trigger-group-key channels)]
    (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse-id schedule op (into #{} (map :id) group))))

(defn- move-triggers!
  "Move the SendPulse triggers of a PulseChannel from its `original` row to its `updated` row, given the `changes`
  between them."
  [original updated changes]
  (when (some #(contains? changes %) schedule-columns)
    (update-triggers! :remove-pc-ids [original])
    (update-triggers! :add-pc-ids [updated]))
  (when (contains? changes :enabled)
    (if (:enabled changes)
      (update-triggers! :add-pc-ids [updated])
      (update-triggers! :remove-pc-ids [original]))))

(def ^:private PulseChannelWithRecipients
  "A PulseChannel and its `:id` and `:recipients`, as [[update-pulse-channels!]] takes it."
  [:merge
   ::pulse.schema/pulse-channel.update
   [:map {:closed true}
    [:id         ms/PositiveInt]
    [:recipients {:optional true} [:maybe [:sequential ::pulse.schema/pulse-channel.recipient]]]]])

(defn- user-ids-and-emails
  "The ids of the Users and the raw email addresses among `recipients`, as `[user-ids emails]`."
  [recipients]
  (let [{user-ids true emails false} (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    [user-ids emails]))

(defn- channel-update
  "What `row`, a row of [[update-pulse-channels!]], gives its PulseChannel: its `:id`, the `:new-values` of its columns,
  whether its channel type has recipients, and their `:user-ids`."
  [{:keys [id channel_type enabled details recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details    {}
           recipients []}}]
  {:pre [(integer? id)
         (m/boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [[user-ids emails] (user-ids-and-emails recipients)]
    {:id          id
     :new-values  {:details        (cond-> details
                                     (supports-recipients? channel_type) (assoc :emails emails))
                   :enabled        enabled
                   :schedule_type  schedule_type
                   :schedule_hour  (when (not= schedule_type :hourly)
                                     schedule_hour)
                   :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                     schedule_day)
                   :schedule_frame (when (= schedule_type :monthly)
                                     schedule_frame)}
     :recipients? (boolean (supports-recipients? channel_type))
     :user-ids    (set user-ids)}))

(defn- recipient-writes
  "The PulseChannelRecipients to insert and to delete, as `{:insert rows :delete ids}`, to make the recipients of each of
  the `updates` that have any the Users of its `:user-ids`, given the `stored` recipients."
  [updates stored]
  (let [stored-by-channel (group-by :pulse_channel_id stored)]
    (reduce (fn [writes {:keys [id user-ids]}]
              (let [old (get stored-by-channel id)]
                (-> writes
                    (update :insert into (map (fn [user-id] {:pulse_channel_id id :user_id user-id}))
                            (remove (set (map :user_id old)) user-ids))
                    (update :delete into (comp (remove #(contains? user-ids (:user_id %))) (map :id)) old))))
            {:insert [] :delete []}
            updates)))

(mu/defn update-pulse-channels! :- [:sequential PulseChannelWithRecipients]
  "Update the PulseChannels of `rows`, each an `:id` with its columns and `:recipients`, along with their
  PulseChannelRecipients, moving their SendPulse triggers when their schedule or enabled state changes, and return the
  rows that changed anything."
  [rows :- [:sequential PulseChannelWithRecipients]]
  (if (empty? rows)
    []
    (let [updates   (mapv channel-update rows)
          stored    (u/index-by :id (pulse.db/pulse-channels-with-ids (mapv :id rows)))
          existing  (filterv #(contains? stored (:id %)) updates)
          recipient-channel-ids (into [] (comp (filter :recipients?) (map :id)) updates)
          recipients (when (seq recipient-channel-ids)
                       (pulse.db/pulse-channel-recipients-for-channels recipient-channel-ids))
          changes-of (into {} (map (fn [{:keys [id new-values]}] [id (mi/effective-changes (stored id) new-values)])) existing)
          writes     (recipient-writes (filterv :recipients? updates) recipients)]
      (doseq [[id changes] changes-of
              :when        (seq changes)]
        (pulse.db/update-pulse-channels! [id] changes))
      (doseq [[id changes] changes-of
              :when (seq changes)
              :let  [original (stored id)]]
        (move-triggers! original (merge original changes) changes))
      (when (seq (:insert writes))
        (pulse.db/insert-pulse-channel-recipients! (:insert writes)))
      (when (seq (:delete writes))
        (pulse.db/delete-pulse-channel-recipients-raw! (:delete writes)))
      (let [recipient-changed (into #{}
                                    (concat (map :pulse_channel_id (:insert writes))
                                            (map (comp :pulse_channel_id (u/index-by :id recipients)) (:delete writes))))]
        (filterv (fn [{:keys [id]}]
                   (or (seq (get changes-of id)) (contains? recipient-changed id)))
                 rows)))))

(mu/defn update-pulse-channel-details! :- :nil
  "Set the `:details` of the PulseChannel `pulse-channel`, a row as selected from the app DB."
  [pulse-channel :- [:map [:id ms/PositiveInt]]
   details       :- ::pulse.schema/pulse-channel.details]
  (pulse.db/update-pulse-channels! [(:id pulse-channel)] {:details details})
  nil)

(mu/defn set-pulse-channels-enabled! :- :nil
  "Enable or disable the PulseChannels of the Pulses with `pulse-ids`, adding or removing the SendPulse triggers of the
  ones whose state changes."
  [pulse-ids :- [:sequential ::lib.schema.id/pulse]
   enabled?  :- :boolean]
  (when (seq pulse-ids)
    (let [flipped (vec (remove #(= enabled? (boolean (:enabled %))) (pulse.db/pulse-channels-for-pulses pulse-ids)))]
      (pulse.db/set-pulse-channels-enabled! pulse-ids enabled?)
      (update-triggers! (if enabled? :add-pc-ids :remove-pc-ids) flipped)))
  nil)

(defn- channel-row
  "The PulseChannel row of `channel`, a row of [[create-pulse-channels!]], with every column it sets."
  [{:keys [channel_type channel_id details enabled pulse_id recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details    {}
           recipients []}}]
  {:pre [(integer? pulse_id)
         (boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [[_user-ids emails] (user-ids-and-emails recipients)]
    {:pulse_id       pulse_id
     :channel_type   channel_type
     :channel_id     channel_id
     :details        (cond-> details
                       (supports-recipients? channel_type) (assoc :emails emails))
     :enabled        enabled
     :schedule_type  schedule_type
     :schedule_hour  (when (not= schedule_type :hourly)
                       schedule_hour)
     :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                       schedule_day)
     :schedule_frame (when (= schedule_type :monthly)
                       schedule_frame)}))

(defn check-new-pulse-channels!
  "Throws what inserting the PulseChannels of `rows`, rows of [[create-pulse-channels!]] whose Pulse need not exist yet,
  would throw, for the first that is invalid."
  [rows]
  (doseq [row rows
          :let [channel (channel-row (update row :pulse_id #(or % 0)))]]
    (pulse.schema/check-schedule (merge (zipmap schedule-columns (repeat nil)) channel))
    (check-details-emails channel)))

(mu/defn create-pulse-channels! :- [:sequential ::pulse.schema/pulse-channel]
  "Insert the PulseChannels of `rows` with their PulseChannelRecipients, adding the enabled ones to their SendPulse
  triggers, and return the new channels in order."
  [rows :- [:sequential ::pulse.schema/pulse-channel.create]]
  (if (empty? rows)
    []
    (let [channels   (pulse.db/insert-pulse-channels! (mapv channel-row rows))
          recipients (vec (mapcat (fn [{:keys [channel_type recipients]} channel]
                                    (when (supports-recipients? channel_type)
                                      (map (fn [user-id] {:pulse_channel_id (:id channel) :user_id user-id})
                                           (distinct (first (user-ids-and-emails recipients))))))
                                  rows channels))]
      (update-triggers! :add-pc-ids (filter :enabled channels))
      (when (seq recipients)
        (pulse.db/insert-pulse-channel-recipients! recipients))
      channels)))

(mu/defn delete-pulse-channels! :- :boolean
  "Delete the PulseChannels with `channel-ids` and remove them from their SendPulse triggers, and return whether there
  were any. Does not archive the Pulses left without a channel: see [[metabase.pulse.models.pulse/remove-pulse-channels!]]."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (boolean
   (when (seq channel-ids)
     (let [channels (pulse.db/pulse-channels-with-ids channel-ids)]
       (update-triggers! :remove-pc-ids channels)
       (pulse.db/delete-pulse-channels! channel-ids)
       (seq channels)))))

(methodical/defmethod mi/to-json :model/PulseChannel
  "Don't include `:emails`, we use that purely internally"
  [pulse-channel json-generator]
  (next-method (m/dissoc-in pulse-channel [:details :emails]) json-generator))

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod app-db-copy/spec :model/PulseChannel [_model]
  {:skip? false})

(defmethod change-log/spec :model/PulseChannel [_model]
  {:track [:pulse_id :channel_type :details :schedule_type :schedule_hour :schedule_day :schedule_frame :enabled
           :entity_id :channel_id]
   :skip  []})

(defmethod eid-translation/spec :model/PulseChannel [_model]
  {:names [:pulse-channel]})
