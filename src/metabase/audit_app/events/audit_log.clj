(ns metabase.audit-app.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
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

(defn- details-of
  "The details that the spec of `model` stores for `row`, as the lifecycle `event` leaves it."
  [model row event]
  (let [{:keys [track details]} (audit.spec/spec model)]
    (merge (select-keys row track)
           (when details (details row event)))))

(defn- spec-edit?
  "Whether the lifecycle `event` of a model with an audit spec is a write whose row should say a user made it: not one
  that the archive or restore of another entity carried to its row, nor an update that changes nothing but the columns
  that its spec skips."
  [{:keys [model context object previous-object] :as event}]
  (and (nil? (:archived-with context))
       (or (not (and object previous-object))
           (let [skipped (audit.spec/skipped-columns model)]
             (boolean (or (some #(and (not (skipped %)) (not (audit.spec/same? model % previous-object object)))
                                (into (set (keys object)) (keys previous-object)))
                          (and (:details (audit.spec/spec model))
                               (not= (details-of model object event) (details-of model previous-object event)))))))))

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
    (record-event! event user-id (context-details event))))

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
    (doseq [[[root-model root-id] group] groups
            :let  [user-id (some :user-id group)]
            :when (and (some? root-id) user-id (some spec-edit? group))
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
  (when (premium-features/log-enabled?)
    (let [roots (rolled-roots)]
      (record-own-rows! events roots)
      (record-parent-rows! events all-events)
      (record-rolled-rows! events roots)
      (record-moments! events))))

(events/register-owned-consumer! ::lifecycle
                                 (fn [{:keys [model]}]
                                   (when (audit.spec/spec model)
                                     ::lifecycle))
                                 record-lifecycle-events!)

(def ^:private object-columns
  "The columns that the row of each event of a manual action stores of its object, for the models that have no audit
  spec because no write of theirs records a row."
  {:event/transform-run-start             [:transform_id :status :run_method]
   :event/transform-run-canceled          [:transform_id :status :run_method]
   :event/transform-run-timeout           [:transform_id :status :run_method]
   :event/transform-test-run-start        [:test_type :test_id :status]
   :event/transform-test-run-timeout      [:test_type :test_id :status]
   :event/card-test-run-start             [:test_type :test_id :status]
   :event/card-test-run-timeout           [:test_type :test_id :status]
   :event/segment-test-run-start          [:test_type :test_id :status]
   :event/segment-test-run-timeout        [:test_type :test_id :status]
   :event/security-advisory-acknowledge   [:advisory_id :title :severity :match_status]
   :event/security-advisory-match         [:advisory_id :title :severity :match_status]
   :event/remote-sync-import              [:sync_task_type :version]
   :event/remote-sync-export              [:sync_task_type :version]
   :event/remote-sync-settings-update     [:sync_task_type :version]
   :event/remote-sync-create-branch       [:sync_task_type :version]
   :event/remote-sync-stash               [:sync_task_type :version]})

(defn- manual-details
  "The details that the row of the event `topic` of a manual action stores of its `object`."
  [topic object]
  (cond
    (contains? object-columns topic)
    (select-keys object (get object-columns topic))

    (and (t2/instance? object) (audit.spec/spec (t2/model object)))
    (details-of (t2/model object) object {:object object :topic topic})

    :else
    {}))

(defn- record-manual!
  "Record the audit row of `topic` and the event `params` of a manual action, with what its spec stores of its object."
  [topic {:keys [object] :as params}]
  (when (premium-features/log-enabled?)
    (record! topic (assoc params :details (merge (:details params) (manual-details topic object))))))

(events/derive! ::table-event ::event)
(events/derive! :event/table-manual-scan ::table-event)
(events/derive! :event/table-manual-sync ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::pulse-event ::event)
(events/derive! :event/subscription-unsubscribe ::pulse-event)
(events/derive! :event/subscription-unsubscribe-undo ::pulse-event)
(events/derive! :event/alert-unsubscribe ::pulse-event)
(events/derive! :event/subscription-send ::pulse-event)
(events/derive! :event/alert-send ::pulse-event)

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [id object user-id] :as _event}]
  (record! topic
           {:details  object
            :user-id  user-id
            :model    :model/Pulse
            :model-id (or id (:id object))}))

(defn- notification-details
  "The details that the row of an event of a manual action stores of the fully hydrated Notification `notification`."
  [{:keys [subscriptions handlers] :as notification}]
  (if (t2/instance? notification)
    (merge
     (select-keys notification [:id :payload_type :payload_id :creator_id :active])
     {:subscriptions (map #(dissoc % :id :created_at) subscriptions)
      :handlers      (map (fn [handler]
                            (merge (select-keys handler [:id :channel_type :channel_id :template_id :active])
                                   {:recipients (map #(select-keys % [:id :type :user_id :permissions_group_id :details])
                                                     (:recipients handler))}))
                          handlers)})
    {}))

(events/derive! ::notification-event ::event)
(events/derive! :event/notification-create ::notification-event)
(events/derive! :event/notification-update ::notification-event)
(events/derive! :event/notification-unsubscribe ::notification-event)

(methodical/defmethod events/publish-event! ::notification-event
  [topic {:keys [object previous-object user-id] :as event}]
  (when (premium-features/log-enabled?)
    (record! topic
             {:details  (merge (:details event)
                               (if (not-empty previous-object)
                                 (audit-log/update-details (notification-details object)
                                                           (notification-details previous-object))
                                 (notification-details object)))
              :object   object
              :model    :model/Notification
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

(defn- user-details
  "The details that the row of the event `topic` of a manual action on a User stores of the `user`."
  [topic user]
  (case topic
    :event/user-invited
    (select-keys (t2/hydrate user :user_group_memberships)
                 [:groups :first_name :last_name :email :invite_method :sso_source :user_group_memberships :tenant_id])

    (:event/password-reset-initiated :event/password-reset-successful)
    (select-keys user [:token])

    {}))

(methodical/defmethod events/publish-event! ::user-event
  [topic {:keys [object] :as event}]
  (when (premium-features/log-enabled?)
    (record! topic (assoc event :details (merge (:details event) (user-details topic object))))))

(events/derive! ::session-event ::event)
(events/derive! :event/session-revoked ::session-event)
(events/derive! :event/sessions-revoked ::session-event)

(methodical/defmethod events/publish-event! ::session-event
  [topic event]
  (record-manual! topic event))

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
(events/derive! :event/database-manual-sync ::database-event)
(events/derive! :event/database-manual-scan ::database-event)
(events/derive! :event/database-discard-field-values ::database-event)

(methodical/defmethod events/publish-event! ::database-event
  [topic event]
  (record-manual! topic event))

(def ^:private failure-columns
  "The columns that the row of a permission failure stores of its object, by model; a model that it leaves out stores
  none."
  {:model/ApiKey                     [:name :group :key_prefix :user_id]
   :model/Card                       [:name :description :database_id :table_id]
   :model/Channel                    [:id :name :description :type :active]
   :model/Database                   [:id :name :engine]
   :model/Table                      [:id :name :db_id]
   :model/PermissionsGroup           [:id :name :is_tenant_group :magic_group_type]
   :model/PermissionsGroupMembership [:id :user_id :group_id :is_group_manager]
   :model/Document                   [:name :collection_id]
   :model/Comment                    [:target_type :target_id :child_target_id :parent_comment_id]
   :model/Transform                  [:name :description :target :run_trigger]
   :model/TransformRun               [:transform_id :status :run_method]
   :model/Glossary                   [:term]
   :model/CustomVizPlugin            [:identifier :display_name :status :enabled :bundle_hash]
   :model/RemoteSyncTask             [:sync_task_type :version]
   :model/TransformTest              [:transform_id :name :description]
   :model/CardTest                   [:card_id :name :description]
   :model/DataTestRun                [:test_type :test_id :status]
   :model/SegmentTest                [:segment_id :name :description]
   :model/SecurityAdvisory           [:advisory_id :title :severity :match_status]
   :model/Tenant                     [:name :slug :is_active :attributes]})

(defn- failure-extras
  "What the row of a permission failure stores of `object` beside its columns, for the models that store more."
  [model object]
  (case model
    :model/ApiKey       (when (:scope object) {:scope (:scope object)})
    :model/Card         {:model? (= (keyword (:type object)) :model)}
    :model/Segment      (let [table-id (:table_id object)]
                          (assoc (select-keys object [:name :description :revision_message])
                                 :table_id    table-id
                                 :database_id (when table-id (audit-app.db/table-database-id table-id))))
    :model/Transform    {:source (-> (:source object)
                                     (dissoc :body)
                                     (update :query #(select-keys % [:database])))}
    :model/Notification (notification-details object)
    nil))

(defn- permission-failure-details
  "The details that the row of a permission failure stores of its `object`."
  [object]
  (when (t2/instance? object)
    (let [model (t2/model object)]
      (merge (select-keys object (get failure-columns model))
             (failure-extras model object)))))

(events/derive! ::permission-failure-event ::event)
(events/derive! :event/write-permission-failure ::permission-failure-event)
(events/derive! :event/update-permission-failure ::permission-failure-event)
(events/derive! :event/create-permission-failure ::permission-failure-event)

(methodical/defmethod events/publish-event! ::permission-failure-event
  [topic {:keys [object] :as event}]
  (when (premium-features/log-enabled?)
    (record! topic (assoc event :details (merge (:details event) (permission-failure-details object))))))

(events/derive! ::settings-changed-event ::event)
(events/derive! :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::upload-event ::event)
(events/derive! :event/upload-create ::upload-event)
(events/derive! :event/upload-append ::upload-event)
(events/derive! :event/upload-replace ::upload-event)

(methodical/defmethod events/publish-event! ::upload-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::cloud-add-on-event ::event)
(events/derive! :event/cloud-add-on-purchase ::cloud-add-on-event)

(methodical/defmethod events/publish-event! ::cloud-add-on-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::transform-event ::event)
(events/derive! :event/transform-run-start ::transform-event)
(events/derive! :event/transform-run-canceled ::transform-event)
(events/derive! :event/transform-run-timeout ::transform-event)
(events/derive! :event/transform-test-run-start ::transform-event)
(events/derive! :event/transform-test-run-timeout ::transform-event)
(events/derive! :event/transform-inspect-discover ::transform-event)
(events/derive! :event/transform-inspect-lens ::transform-event)

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::card-test-event ::event)
(events/derive! :event/card-test-run-start ::card-test-event)
(events/derive! :event/card-test-run-timeout ::card-test-event)

(methodical/defmethod events/publish-event! ::card-test-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::segment-test-event ::event)
(events/derive! :event/segment-test-run-start ::segment-test-event)
(events/derive! :event/segment-test-run-timeout ::segment-test-event)

(methodical/defmethod events/publish-event! ::segment-test-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::remote-sync-event ::event)
(events/derive! :event/remote-sync-import ::remote-sync-event)
(events/derive! :event/remote-sync-export ::remote-sync-event)
(events/derive! :event/remote-sync-settings-update ::remote-sync-event)
(events/derive! :event/remote-sync-create-branch ::remote-sync-event)
(events/derive! :event/remote-sync-stash ::remote-sync-event)

(methodical/defmethod events/publish-event! ::remote-sync-event
  [topic event]
  (record-manual! topic event))

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
      (record-manual! :event/table-data-edit (merge event {:model :model/Table :model-id table-id}))
      (record-manual! topic event))))

(events/derive! ::security-advisory-event ::event)
(events/derive! :event/security-advisory-acknowledge ::security-advisory-event)
(events/derive! :event/security-advisory-match ::security-advisory-event)

(methodical/defmethod events/publish-event! ::security-advisory-event
  [topic event]
  (record-manual! topic event))
