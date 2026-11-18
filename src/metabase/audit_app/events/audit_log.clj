(ns metabase.audit-app.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)

(events/register-sink! ::rows audit-log/record-rows!)

(defn- record!
  "Record the audit row of `topic` and `params` with the other rows of the batch, in their order, or at once outside a
  batch."
  [topic params]
  (when-let [row (audit-log/audit-row topic params)]
    (events/add-to-sink! ::rows row)))

(defn- row-of
  "The row that the lifecycle `event` is about."
  [{:keys [object previous-object]}]
  (or object previous-object))

(defn- spec-edit?
  "Whether the lifecycle `event` of a model with an audit spec is a write whose row should say a user made it: not one
  that the archive or restore of another entity carried to its row, nor an update that changes nothing but the columns
  that its spec skips."
  [{:keys [model context object previous-object]}]
  (and (nil? (:archived-with context))
       (or (not (and object previous-object))
           (let [skipped (audit.spec/skipped-columns model)]
             (boolean (some #(and (not (skipped %)) (not (audit.spec/same? model % previous-object object)))
                            (into (set (keys object)) (keys previous-object))))))))

(defn- default-topic
  "The topic of the event that `model` publishes for `operation`, as it is stored."
  [model operation]
  (some-> (events/spec model) (get operation) name keyword))

(defn- stored-topic
  "The topic to store for the lifecycle `event`, nil when it records nothing."
  [{:keys [model operation] :as event}]
  (if-let [topics (:topics (audit.spec/spec model))]
    (let [topic (get topics operation)]
      (if (keyword? topic)
        topic
        (when topic (topic event))))
    (default-topic model operation)))

(defn- details-of
  "The details that the spec of `model` stores for `row`, as the lifecycle `event` leaves it."
  [model row event]
  (let [{:keys [track details]} (audit.spec/spec model)]
    (merge (select-keys row track)
           (when details (details row event)))))

(defn- event-details
  "The details of the row that the lifecycle `event` records: the changes of an update, or the details of the row."
  [{:keys [model object previous-object] :as event}]
  (if (and (get (audit.spec/spec model) :changes? true) object (not-empty previous-object))
    (audit-log/update-details (details-of model object event) (details-of model previous-object event))
    (details-of model (row-of event) event)))

(defn- context-details
  "The details that the context of the lifecycle `event` of a write adds to its row."
  [{:keys [model context]}]
  (cond-> {}
    (:revision-message context)                                   (assoc :revision-message (:revision-message context))
    (and (:details context) (:context-details? (audit.spec/spec model))) (merge (:details context))))

(defn- subject-of
  "The `[model id]` under which the row of the lifecycle `event` is recorded."
  [{:keys [model] :as event}]
  (if-let [subject (:subject (audit.spec/spec model))]
    (subject event)
    [model (:id (row-of event))]))

(defn- recorded-user
  "The id of the user that the row of the lifecycle `event` is recorded as."
  [{:keys [model operation object user-id]}]
  (or (when (= :create operation)
        (some->> (:creator (audit.spec/spec model)) (get object)))
      user-id))

(defn- record-event!
  "Record the row of the lifecycle `event` of a write by the user `user-id`, with `extra` beside its details, when its
  spec stores a topic for it."
  [event user-id extra]
  (when-let [topic (stored-topic event)]
    (let [[model model-id] (subject-of event)]
      (record! topic {:user-id  user-id
                      :model    model
                      :model-id model-id
                      :details  (merge extra (event-details event))}))))

(defn- chain-parent
  "The `:parent` of `model` when a write of its rows counts as a write of the parent, nil otherwise."
  [model]
  (let [parent (audit.spec/parent model)]
    (when-not (:topics parent)
      parent)))

(defn- parent-ref
  "The `[parent-model parent-id]` of the row that the `event` writes."
  [{:keys [model] :as event}]
  (let [{parent-model :model k :key} (audit.spec/parent model)]
    [parent-model (get (row-of event) k)]))

(defn- parent-links
  "The `[model id]` of the parent of each of `refs`, the `[model id]` of rows whose writes count as writes of a parent,
  loaded together: one query for the rows of each model, however many levels there are above them."
  [refs]
  (loop [pending (into #{} (filter #(chain-parent (first %))) refs)
         links   {}]
    (if (empty? pending)
      links
      (let [found (into {}
                        (mapcat (fn [[model refs*]]
                                  (let [{parent-model :model k :key} (chain-parent model)]
                                    (for [[id parent-id] (audit-app.db/parent-ids model k (map second refs*))]
                                      [[model id] [parent-model parent-id]]))))
                        (group-by first pending))]
        (recur (into #{}
                     (comp (map val)
                           (filter #(chain-parent (first %)))
                           (remove #(contains? (merge links found) %)))
                     found)
               (merge links found))))))

(defn- top-ref
  "The topmost parent that the `ref` leads up to, through `links`, nil when a parent is missing."
  [links ref]
  (loop [ref ref]
    (cond
      (nil? (chain-parent (first ref))) ref
      (contains? links ref)             (recur (get links ref))
      :else                             nil)))

(defn- rolled-roots
  "The audited models whose rows have the writes of other models counted as writes of them."
  []
  (into #{}
        (keep (fn [model]
                (when (chain-parent model)
                  (loop [model model]
                    (if-let [{parent-model :model} (chain-parent model)]
                      (recur parent-model)
                      model)))))
        (audit.spec/audited-models)))

(defn- record-own-rows!
  "Record the rows of the writes of the models that record them as their own."
  [events roots]
  (doseq [{:keys [model user-id] :as event} events
          :when (and user-id
                     (nil? (audit.spec/parent model))
                     (not (contains? roots model))
                     (spec-edit? event))]
    (record-event! event (recorded-user event) (context-details event))))

(defn- record-parent-rows!
  "Record, once per parent and topic, the writes of the models that record them under a parent with a topic, none for a
  parent that the batch creates."
  [events all-events]
  (let [groups (group-by (fn [{:keys [model operation] :as event}]
                           (let [topic (get (:topics (audit.spec/parent model)) operation)]
                             (when topic
                               [(parent-ref event) topic])))
                         (filter #(:topics (audit.spec/parent (:model %))) events))]
    (doseq [[[[parent-model parent-id :as ref] topic] group] groups
            :when (and (some? ref)
                       (some? parent-id)
                       (some :user-id group)
                       (not-any? #(and (= parent-model (:model %))
                                       (= :create (:operation %))
                                       (= parent-id (:id %)))
                                 all-events))]
      (record! topic {:user-id  (some :user-id group)
                      :model    parent-model
                      :model-id parent-id
                      :details  ((:details (audit.spec/parent (:model (first group)))) parent-id group)}))))

(defn- record-rolled-rows!
  "Record, once per topmost parent, the writes of a batch to a row and to the rows that count as parts of it, as the
  write of the row that its own events say, an update when there are none."
  [events roots]
  (let [parts   (filter #(chain-parent (:model %)) events)
        links   (parent-links (into #{} (map parent-ref) parts))
        ref-of  (fn [{:keys [model] :as event}]
                  (if (contains? roots model)
                    [model (:id (row-of event))]
                    (top-ref links (parent-ref event))))
        groups  (group-by ref-of (filter #(or (contains? roots (:model %)) (chain-parent (:model %))) events))]
    (doseq [[[root-model root-id :as ref] group] groups
            :let  [user-id (some :user-id group)]
            :when (and (some? ref) user-id (some spec-edit? group))
            :let  [own   (first (filter #(= root-model (:model %)) group))
                   event (or own
                             (when-let [row (audit-app.db/row root-model root-id)]
                               {:model root-model :operation :update :id root-id :object row}))]
            :when event]
      (record-event! event user-id {}))))

(defn- record-moments!
  "Record the rows that the spec of a model derives from a column that its writes change."
  [events]
  (doseq [{:keys [model operation user-id] :as event} events
          :when (and user-id (contains? #{:create :update} operation))
          {moment-topic :topic, applies? :when, moment-details :details} (:moments (audit.spec/spec model))
          :when (applies? event)]
    (record! moment-topic {:user-id  user-id
                           :model    model
                           :model-id (:id (row-of event))
                           :details  (if moment-details (moment-details event) {})})))

(defn- record-lifecycle-events!
  "Record the rows of the lifecycle events of the audited models of a batch, once per batch."
  [_owner events all-events]
  (let [roots (rolled-roots)]
    (record-own-rows! events roots)
    (record-parent-rows! events all-events)
    (record-rolled-rows! events roots)
    (record-moments! events)))

(events/register-owned-consumer! ::lifecycle
                                 (fn [{:keys [model]}]
                                   (when (audit.spec/spec model)
                                     ::lifecycle))
                                 record-lifecycle-events!)

(def ^:private context-details-models
  "The models whose events take the `:details` of the event context into the row, the others being written by the same
  operation without being what it is about."
  #{:model/ApiKey :model/CacheConfig :model/Database})

(def ^:private ignored-columns
  "For each model, the columns whose change alone is not a user action to record, `:default` being the counters and
  timestamps that every model has."
  {:default         #{:updated_at :view_count :last_used_at :last_viewed_at :cache_invalidated_at :last_query_start
                      :collection_position :entity_id}
   :model/Dashboard #{:position}
   :model/Database  #{:initial_sync_status :dbms_version :timezone}
   :model/Measure   #{:dimensions :dimension_mappings}
   :model/Transform #{:last_checkpoint_value :target_table_id :table_dependencies}
   :model/User      #{:last_login :deactivated_at :is_active :password :password_salt :reset_token :reset_triggered
                      :is_qbnewb :settings}})

(defn- ignored-column?
  [model column]
  (or (contains? (ignored-columns :default) column)
      (contains? (get ignored-columns model) column)))

(defn- model-overrides
  "The overrides that a user can set in the columns of `metadata` that `other` has too, by column name."
  [metadata other]
  (let [names (into #{} (map :name) other)
        keys* (into #{:name} (map u/->snake_case_en) (lib/model-preserved-keys false))]
    (into {}
          (comp (filter (comp names :name))
                (map (juxt :name #(select-keys % keys*))))
          metadata)))

(defn- edited-column?
  "Whether the change of `column` in the update `event` of a row of `model` is one a user can make: the result metadata
  of a model changes by what a user sets in it, and of any other card by nothing, for the product recomputes it."
  [model column {:keys [object previous-object]}]
  (if (and (= :model/Card model) (= :result_metadata column))
    (let [previous (:result_metadata previous-object)
          current  (:result_metadata object)]
      (boolean (and (= :model (keyword (:type object)))
                    (seq previous)
                    (not= (model-overrides previous current) (model-overrides current previous)))))
    true))

(defn- user-edit?
  "Whether the lifecycle `event` is a write whose row should say a user made it: not one that the archive or restore of
  another entity carried to its row, nor an update that changes nothing but ignored columns."
  [{:keys [context object previous-object] :as event}]
  (and (nil? (:archived-with context))
       (or (not (and object previous-object))
           (let [model (u.events/model-of event)]
             (boolean (some #(and (not (ignored-column? model %)) (edited-column? model % event))
                            (u.events/changed-keys event)))))))

(defn- record-lifecycle!
  "Record the lifecycle `event` of a write by a user under `stored-topic`, with the changes of an update when
  `previous?`, and nothing for a write without a user or one that is no edit by a user."
  [stored-topic {:keys [user-id object previous-object context] :as event} previous?]
  (when (and user-id (user-edit? event))
    (record! stored-topic
             (cond-> {:object (or object previous-object) :user-id user-id}
               (and previous? object previous-object) (assoc :previous-object previous-object)
               (:revision-message context)             (assoc :details {:revision-message (:revision-message context)})
               (and (:details context)
                    (context-details-models (u.events/model-of event))) (update :details merge (:details context))))))

(events/derive! ::card-event ::event)
(events/derive! :event/card-create ::card-event)
(events/derive! :event/card-update ::card-event)
(events/derive! :event/card-delete ::card-event)

(defn- card-archive-only?
  "Whether `event` is an update that only archives or restores the Card directly, which records no row."
  [event]
  (let [changed (set/difference (u.events/changed-keys event) (ignored-columns :default))]
    (and (contains? changed :archived)
         (set/subset? changed #{:archived :archived_directly}))))

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (when-not (and (= :event/card-update topic) (card-archive-only? event))
    (record-lifecycle! topic event true)))

(events/derive! ::dashboard-event ::event)
(events/derive! :event/dashboard-create ::dashboard-event)
(events/derive! :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (record-lifecycle! topic event false))

(defn- dashcards-owner
  "The `[dashboard-id operation]` of the DashboardCard `event` of an addition or a removal, nil for the others."
  [{:keys [model operation object previous-object]}]
  (when (and (= :model/DashboardCard model) (#{:create :delete} operation))
    [(:dashboard_id (or object previous-object)) operation]))

(defn- record-dashcards!
  "Record that the cards of `events`, the DashboardCards added to or removed from one Dashboard, were."
  [[dashboard-id operation] events all-events]
  (when-let [user-id (and (not (some #(and (= :model/Dashboard (:model %))
                                           (= :create (:operation %))
                                           (= dashboard-id (:id %)))
                                     all-events))
                          (some :user-id events))]
    (let [dashboard (audit-app.db/dashboard dashboard-id)
          dashcards (map #(or (:object %) (:previous-object %)) events)
          cards     (into {}
                          (map (juxt :id #(select-keys % [:name :description])))
                          (audit-app.db/cards (keep :card_id dashcards)))
          details   (-> (select-keys dashboard [:description :name :id])
                        (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                            (-> (cards card_id)
                                                (assoc :id id)
                                                (assoc :card_id card_id)))))]
      (record! (if (= :create operation) :event/dashboard-add-cards :event/dashboard-remove-cards)
               {:details  details
                :user-id  user-id
                :model    :model/Dashboard
                :model-id dashboard-id}))))

(events/register-owned-consumer! ::dashcards dashcards-owner record-dashcards!)

(events/derive! ::table-event ::event)
(events/derive! :event/table-manual-scan ::table-event)
(events/derive! :event/table-manual-sync ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic event]
  (record! topic event))

(events/derive! ::pulse-event ::event)
(events/derive! :event/subscription-unsubscribe ::pulse-event)
(events/derive! :event/subscription-unsubscribe-undo ::pulse-event)
(events/derive! :event/alert-unsubscribe ::pulse-event)
(events/derive! :event/subscription-send ::pulse-event)
(events/derive! :event/alert-send ::pulse-event)

(defn- create-details-map [pulse name is-alert parent]
  (let [channels  (:channels pulse)
        parent-id (if is-alert :card_id :dashboard_id)]
    {:archived   (:archived pulse)
     :name       name
     parent-id   parent
     :parameters (:parameters pulse)
     :channel    (map :channel_type channels)
     :schedule   (map :schedule_type channels)
     :recipients (map :recipients channels)}))

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [id object user-id] :as _event}]
  ;; Check if object contains the keys that we want populated, if not then may be a unsubscribe/send event
  (let [details-map (if (some? (:id object))
                      (create-details-map object (:name object) false (:dashboard_id object))
                      object)
        model-id    (or id (:id object))]
    (record! topic
             {:details  details-map
              :user-id  user-id
              :model    :model/Pulse
              :model-id model-id})))

(defn- pulse-row
  "The audit row params of the Pulse or Alert `pulse-id` after the writes `events`, as the user who made them: the
  creation or the update of a Subscription, the creation of a legacy Pulse, the update of an Alert, none for the
  creation of one."
  [pulse-id events]
  (let [created?  (some #(and (= :model/Pulse (:model %)) (= :create (:operation %))) events)
        pulse-row (some #(when (= :model/Pulse (:model %)) (:object %)) events)
        alert     (when-not (and pulse-row (nil? (:alert_condition pulse-row)))
                    (pulse/retrieve-alert pulse-id))]
    (if alert
      (when-not created?
        [:event/alert-update {:details  (create-details-map alert (:name (:card alert)) true (:id (:card alert)))
                              :model    :model/Card
                              :model-id (:id alert)}])
      (when-let [pulse (pulse/retrieve-pulse pulse-id)]
        [(cond
           (not created?)        :event/subscription-update
           (:dashboard_id pulse) :event/subscription-create
           :else                 :event/pulse-create)
         {:details  (create-details-map pulse (:name pulse) false (:dashboard_id pulse))
          :model    :model/Pulse
          :model-id pulse-id}]))))

(defn- record-pulses!
  "Record, once per Pulse, the writes of a batch to a Pulse, its cards, its channels and their recipients: one row per
  Pulse that a user wrote, none for one that was deleted, nor for the upkeep of a Dashboard's subscriptions, nor for a
  write that no user made."
  [_owner events _all-events]
  (let [channel->pulse (audit-app.db/pulse-ids-of-channels
                        (into #{} (comp (filter #(= :model/PulseChannelRecipient (:model %)))
                                        (keep #(:pulse_channel_id (or (:object %) (:previous-object %)))))
                              events))
        pulse-id-of    (fn [{:keys [model object previous-object]}]
                         (let [row (or object previous-object)]
                           (case model
                             :model/Pulse                 (:id row)
                             :model/PulseChannelRecipient (channel->pulse (:pulse_channel_id row))
                             (:pulse_id row))))]
    (doseq [[pulse-id pulse-events] (group-by pulse-id-of events)
            :when (and pulse-id
                       (some :user-id pulse-events)
                       (some user-edit? pulse-events)
                       (not-any? #(and (= :model/Pulse (:model %)) (= :delete (:operation %))) pulse-events))
            :let  [[topic params] (pulse-row pulse-id pulse-events)]
            :when topic]
      (record! topic (assoc params :user-id (some :user-id pulse-events))))))

(events/register-owned-consumer! ::pulses
                                 (fn [{:keys [model]}]
                                   (when (#{:model/Pulse :model/PulseCard :model/PulseChannel :model/PulseChannelRecipient}
                                          model)
                                     ::pulses))
                                 record-pulses!)

(events/derive! ::notification-event ::event)
(events/derive! :event/notification-create ::notification-event)
(events/derive! :event/notification-update ::notification-event)
(events/derive! :event/notification-unsubscribe ::notification-event)

(methodical/defmethod events/publish-event! ::notification-event
  [topic {:keys [object user-id] :as event}]
  (record! topic
           (merge
            event
            {:model    :model/Notification
             :model-id (:id object)
             :user-id  user-id})))

(events/derive! ::notification-handler-event ::event)
(events/derive! :event/notification-unsubscribe-ex ::notification-handler-event)
(events/derive! :event/notification-unsubscribe-undo-ex ::notification-handler-event)

(methodical/defmethod events/publish-event! ::notification-handler-event
  [topic {:keys [object user-id] :as event}]
  (record! topic
           (merge
            event
            {:model    :model/NotificationHandler
             :model-id (:id object)
             :user-id  user-id})))

(events/derive! ::measure-event ::event)
(events/derive! :event/measure-create ::measure-event)
(events/derive! :event/measure-update ::measure-event)
(events/derive! :event/measure-delete ::measure-event)

(methodical/defmethod events/publish-event! ::measure-event
  [topic event]
  (record-lifecycle! topic event false))

(events/derive! ::user-event ::event)
(events/derive! :event/user-invited ::user-event)
(events/derive! :event/password-reset-initiated ::user-event)
(events/derive! :event/password-reset-successful ::user-event)
(events/derive! :event/password-changed ::user-event)
(events/derive! :event/mfa-verification-failed ::user-event)
(events/derive! :event/mfa-required-enrollment-failed ::user-event)
(events/derive! :event/mfa-enrolled ::user-event)
(events/derive! :event/mfa-disabled ::user-event)
(events/derive! :event/mcp-jwt-token-issued ::user-event)

(methodical/defmethod events/publish-event! ::user-event
  [topic event]
  (record! topic event))

;; session events

(events/derive! ::session-event ::event)
(events/derive! :event/session-revoked ::session-event)
(events/derive! :event/sessions-revoked ::session-event)

(methodical/defmethod events/publish-event! ::session-event
  [topic event]
  (record! topic event))

(events/derive! ::user-update-event ::event)
(events/derive! :event/user-update ::user-update-event)

(defn- api-key-user?
  "Whether the User of `event` is the one that an API key owns, which no page lists."
  [{:keys [object previous-object]}]
  (= "api-key" (some-> (or object previous-object) :type name)))

(methodical/defmethod events/publish-event! ::user-update-event
  [topic event]
  (when-not (api-key-user? event)
    (record-lifecycle! topic event true)))

(events/derive! ::user-joined-event ::event)
(events/derive! :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic {:keys [user-id]}]
  (record! topic
           {:user-id  user-id
            :model    :model/User
            :model-id user-id}))

(events/derive! ::install-event ::event)
(events/derive! :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [topic _event]
  (when-not (audit-app.db/audit-log-topic-exists? "install")
    (record! topic {})))

(events/derive! ::database-event ::event)
(events/derive! :event/database-create ::database-event)
(events/derive! :event/database-delete ::database-event)
(events/derive! :event/database-create ::lifecycle-event)
(events/derive! :event/database-delete ::lifecycle-event)
(events/derive! :event/database-manual-sync ::database-event)
(events/derive! :event/database-manual-scan ::database-event)
(events/derive! :event/database-discard-field-values ::database-event)

(methodical/defmethod events/publish-event! ::database-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (record-lifecycle! topic event false)
    (record! topic event)))

(events/derive! ::database-update-event ::event)
(events/derive! :event/database-update ::database-update-event)

(methodical/defmethod events/publish-event! ::database-update-event
  [topic event]
  (if (:details event)
    (record! topic event)
    (record-lifecycle! topic event true)))

(events/derive! ::permission-failure-event ::event)
(events/derive! :event/write-permission-failure ::permission-failure-event)
(events/derive! :event/update-permission-failure ::permission-failure-event)
(events/derive! :event/create-permission-failure ::permission-failure-event)

(methodical/defmethod events/publish-event! ::permission-failure-event
  [topic event]
  (record! topic event))

(events/derive! ::settings-changed-event ::event)
(events/derive! :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [topic event]
  (record! topic event))

(events/derive! ::api-key-event ::event)
(events/derive! :event/api-key-create ::api-key-event)
(events/derive! :event/api-key-update ::api-key-event)
(events/derive! :event/api-key-delete ::api-key-event)

(defn- hydrate-api-key
  [api-key]
  (some-> api-key (t2/hydrate :user :group :updated_by)))

(defn- api-key-event-with-groups
  "The lifecycle `event` of an ApiKey with the Permissions Group each side had, the previous one as the writer saw it
  before the write, since the write moves the key's User out of it."
  [{:keys [context] :as event}]
  (let [previous-group (get-in context [:details :previous-group])]
    (cond-> (-> event
                (update :context dissoc :details)
                (m/update-existing :object hydrate-api-key)
                (m/update-existing :previous-object hydrate-api-key))
      (and previous-group (:previous-object event)) (assoc-in [:previous-object :group] previous-group))))

(methodical/defmethod events/publish-event! ::api-key-event
  [topic event]
  (let [event (api-key-event-with-groups event)]
    (record-lifecycle! (if (and (= :event/api-key-update topic) (u.events/changed? event :key_prefix))
                         :event/api-key-regenerate
                         topic)
                       event
                       true)))

(events/derive! ::upload-event ::event)
(events/derive! :event/upload-create ::upload-event)
(events/derive! :event/upload-append ::upload-event)
(events/derive! :event/upload-replace ::upload-event)

(methodical/defmethod events/publish-event! ::upload-event
  [topic event]
  (record! topic event))

(events/derive! ::cache-config-changed-event ::event)
(events/derive! :event/cache-config-create ::cache-config-changed-event)
(events/derive! :event/cache-config-update ::cache-config-changed-event)
(events/derive! :event/cache-config-delete ::cache-config-changed-event)

(methodical/defmethod events/publish-event! ::cache-config-changed-event
  [_topic event]
  (record-lifecycle! :event/cache-config-update event false))

(events/derive! ::channel-event ::event)
(events/derive! :event/channel-create ::channel-event)
(events/derive! :event/channel-update ::channel-event)

(methodical/defmethod events/publish-event! ::channel-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::permissions-group-event ::event)
(events/derive! :event/group-create ::permissions-group-event)
(events/derive! :event/group-update ::permissions-group-event)
(events/derive! :event/group-delete ::permissions-group-event)

(methodical/defmethod events/publish-event! ::permissions-group-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::permissions-group-membership-event ::event)
(events/derive! :event/group-membership-create ::permissions-group-membership-event)
(events/derive! :event/group-membership-delete ::permissions-group-membership-event)

(methodical/defmethod events/publish-event! ::permissions-group-membership-event
  [topic event]
  (record-lifecycle! topic (cond-> event
                             (= :event/group-membership-create topic) (update :object dissoc :id))
                     false))

(events/derive! ::cloud-add-on-event ::event)
(events/derive! :event/cloud-add-on-purchase ::cloud-add-on-event)

(methodical/defmethod events/publish-event! ::cloud-add-on-event
  [topic event]
  (record! topic event))

(events/derive! ::document-event ::event)
(events/derive! :event/document-create ::document-event)
(events/derive! :event/document-update ::document-event)
(events/derive! :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic {:keys [object previous-object] :as event}]
  (when-not (:exploration_id (or object previous-object))
    (record-lifecycle! (if (and (= :event/document-update topic)
                                (true? (:archived object))
                                (u.events/changed? event :archived))
                         :event/document-delete
                         topic)
                       event
                       false)))

(events/derive! ::comment-event ::event)
(events/derive! :event/comment-create ::comment-event)
(events/derive! :event/comment-update ::comment-event)
(events/derive! :event/comment-delete ::comment-event)

(methodical/defmethod events/publish-event! ::comment-event
  [topic event]
  (record-lifecycle! (if (and (= :event/comment-update topic) (u.events/changed? event :deleted_at))
                       :event/comment-delete
                       topic)
                     event
                     false))

(events/derive! ::transform-event ::event)
(events/derive! ::lifecycle-event ::event)
(events/derive! :event/transform-create ::lifecycle-event)
(events/derive! :event/transform-delete ::lifecycle-event)
(events/derive! :event/transform-update ::lifecycle-event)
(events/derive! :event/transform-test-create ::lifecycle-event)
(events/derive! :event/transform-test-update ::lifecycle-event)
(events/derive! :event/transform-test-delete ::lifecycle-event)
(events/derive! :event/card-test-create ::lifecycle-event)
(events/derive! :event/card-test-update ::lifecycle-event)
(events/derive! :event/card-test-delete ::lifecycle-event)
(events/derive! :event/segment-test-create ::lifecycle-event)
(events/derive! :event/segment-test-update ::lifecycle-event)
(events/derive! :event/segment-test-delete ::lifecycle-event)
(events/derive! :event/transform-create ::transform-event)
(events/derive! :event/update-transform ::transform-event)
(events/derive! :event/transform-update ::transform-event)
(events/derive! :event/transform-delete ::transform-event)
(events/derive! :event/transform-run-start ::transform-event)
(events/derive! :event/transform-run-canceled ::transform-event)
(events/derive! :event/transform-run-timeout ::transform-event)
(events/derive! :event/transform-test-create ::transform-event)
(events/derive! :event/transform-test-update ::transform-event)
(events/derive! :event/transform-test-delete ::transform-event)
(events/derive! :event/transform-test-run-start ::transform-event)
(events/derive! :event/transform-test-run-timeout ::transform-event)
(events/derive! :event/transform-inspect-discover ::transform-event)
(events/derive! :event/transform-inspect-lens ::transform-event)

(def ^:private lifecycle-stored-topics
  "The stored topic of the lifecycle topics whose audit log name is another."
  {:event/transform-update :event/update-transform})

(def ^:private creator-recorded-topics
  "The creation topics of the saved tests, recorded as their creator when a user writes them."
  #{:event/transform-test-create :event/card-test-create :event/segment-test-create})

(defn- record-saved-test-lifecycle!
  [topic {:keys [object user-id] :as event}]
  (record-lifecycle! topic
                     (cond-> event
                       (and user-id (creator-recorded-topics topic) (:creator_id object))
                       (assoc :user-id (:creator_id object)))
                     false))

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (if (re-find #"test" (name topic))
      (record-saved-test-lifecycle! topic event)
      (record-lifecycle! (get lifecycle-stored-topics topic topic) event false))
    (record! topic event)))

(events/derive! ::card-test-event ::event)
(events/derive! :event/card-test-create ::card-test-event)
(events/derive! :event/card-test-update ::card-test-event)
(events/derive! :event/card-test-delete ::card-test-event)
(events/derive! :event/card-test-run-start ::card-test-event)
(events/derive! :event/card-test-run-timeout ::card-test-event)

(methodical/defmethod events/publish-event! ::card-test-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (record-saved-test-lifecycle! topic event)
    (record! topic event)))

(events/derive! ::segment-test-event ::event)
(events/derive! :event/segment-test-create ::segment-test-event)
(events/derive! :event/segment-test-update ::segment-test-event)
(events/derive! :event/segment-test-delete ::segment-test-event)
(events/derive! :event/segment-test-run-start ::segment-test-event)
(events/derive! :event/segment-test-run-timeout ::segment-test-event)

(methodical/defmethod events/publish-event! ::segment-test-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (record-saved-test-lifecycle! topic event)
    (record! topic event)))

(events/derive! ::glossary-event ::event)
(events/derive! :event/glossary-create ::glossary-event)
(events/derive! :event/glossary-update ::glossary-event)
(events/derive! :event/glossary-delete ::glossary-event)

(methodical/defmethod events/publish-event! ::glossary-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::custom-viz-plugin-event ::event)
(events/derive! :event/custom-viz-plugin-create ::custom-viz-plugin-event)
(events/derive! :event/custom-viz-plugin-update ::custom-viz-plugin-event)
(events/derive! :event/custom-viz-plugin-delete ::custom-viz-plugin-event)

(methodical/defmethod events/publish-event! ::custom-viz-plugin-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::remote-sync-event ::event)
(events/derive! :event/remote-sync-import ::remote-sync-event)
(events/derive! :event/remote-sync-export ::remote-sync-event)
(events/derive! :event/remote-sync-settings-update ::remote-sync-event)
(events/derive! :event/remote-sync-create-branch ::remote-sync-event)
(events/derive! :event/remote-sync-stash ::remote-sync-event)

(methodical/defmethod events/publish-event! ::remote-sync-event
  [topic event]
  (record! topic event))

(events/derive! ::action-v2-event ::event)
(events/derive! :event/action-v2-execute ::action-v2-event)
(events/derive! :event/table-data-edit :event/action-v2-execute)

(methodical/defmethod events/publish-event! ::action-v2-event
  [topic event]
  (let [table-data-edit-events #{:data-grid.row/create :data-grid.row/update :data-grid.row/delete :data-editing/undo :data-editing/redo}]
    (if-let [table-id
             (and (contains? table-data-edit-events
                             (when-let [event (get-in event [:details :action])]
                               (when (or (string? event) (keyword? event))
                                 (keyword event))))
                  (get-in event [:details :scope :table_id]))]
      (record! :event/table-data-edit (merge event {:model :model/Table :model-id table-id}))
      (record! topic event))))

(events/derive! ::tenant-event ::event)
(events/derive! :event/tenant-create ::tenant-event)
(events/derive! :event/tenant-update ::tenant-event)

(methodical/defmethod events/publish-event! ::tenant-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::security-advisory-event ::event)
(events/derive! :event/security-advisory-acknowledge ::security-advisory-event)
(events/derive! :event/security-advisory-match ::security-advisory-event)

(methodical/defmethod events/publish-event! ::security-advisory-event
  [topic event]
  (record! topic event))

(defn- column-change
  "The `[topic params]` that the lifecycle `event` of a write records for a column it changes, or nil."
  [{:keys [model object previous-object user-id] :as event}]
  (let [row (or object previous-object)]
    (case model
      :model/Card
      (when (u.events/changed? event :public_uuid)
        [(if (some? (:public_uuid object)) :event/card-public-link-created :event/card-public-link-deleted)
         {:user-id user-id :model model :model-id (:id row)}])

      :model/Dashboard
      (when (u.events/changed? event :public_uuid)
        [(if (some? (:public_uuid object)) :event/dashboard-public-link-created :event/dashboard-public-link-deleted)
         {:user-id user-id :model model :model-id (:id row)}])

      :model/User
      (when (and previous-object (u.events/changed? event :is_active) (not (api-key-user? event)))
        [(if (:is_active object) :event/user-reactivated :event/user-deactivated)
         {:user-id user-id :object object}])

      :model/Table
      (when (u.events/changed? event :is_published)
        (cond
          (true? (:is_published object)) [:event/table-publish {:user-id user-id :object object}]
          previous-object                [:event/table-unpublish {:user-id user-id :object object}]))
      nil)))

(defn- record-column-changes!
  [_owner events _all-events]
  (doseq [event events
          :when (:user-id event)
          :let  [[topic params] (column-change event)]
          :when topic]
    (record! topic params)))

(events/register-owned-consumer! ::column-changes
                                 (fn [{:keys [model operation]}]
                                   (when (and (#{:create :update} operation)
                                              (#{:model/Card :model/Dashboard :model/User :model/Table} model))
                                     ::column-changes))
                                 record-column-changes!)

(events/derive! ::database-router-event ::event)
(events/derive! :event/database-router-create ::database-router-event)
(events/derive! :event/database-router-update ::database-router-event)
(events/derive! :event/database-router-delete ::database-router-event)

(methodical/defmethod events/publish-event! ::database-router-event
  [topic {:keys [object previous-object user-id]}]
  (when user-id
    (let [router   (or object previous-object)
          database (audit-app.db/database (:database_id router))]
      (record! :event/database-update
               {:object          database
                :previous-object database
                :user-id         user-id
                :details         (if (= :event/database-router-delete topic)
                                   {:db_routing :disabled}
                                   {:db_routing        :enabled
                                    :routing_attribute (:user_attribute router)})}))))
