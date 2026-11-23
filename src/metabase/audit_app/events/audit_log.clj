(ns metabase.audit-app.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)

(defn- record!
  "Record the audit row of `topic` and `params`."
  [topic params]
  (when-let [row (audit-log/audit-row topic params)]
    (audit-log/create-audit-logs! [row])))

(defn- record-each!
  "Record the audit row that `build-row` makes of each of `items`, in one insert.
  An item whose row cannot be built is skipped, and when the insert fails each row is inserted on its own."
  [build-row items]
  (let [rows (into []
                   (keep (fn [item]
                           (try
                             (build-row item)
                             (catch Exception e
                               (log/warnf "Failed to build an audit row for event item %s: %s" (:id item) (ex-message e))
                               nil))))
                   items)]
    (when (seq rows)
      (try
        (audit-log/create-audit-logs! rows)
        (catch Exception e
          (log/warnf "Failed to insert %d audit rows in one statement, inserting them one by one: %s" (count rows) (ex-message e))
          (doseq [row rows]
            (try
              (audit-log/create-audit-logs! [row])
              (catch Exception e
                (log/warnf "Failed to insert an audit row: %s" (ex-message e))))))))))

(defn- row-of
  "The row that the lifecycle `event` is about."
  [{:keys [object previous-object]}]
  (or object previous-object))

(defn- details-of
  "The details that the spec of `model` stores for `row`, as the lifecycle `event` leaves it, nil when its `:details` fn
  returns nil because the row no longer exists."
  [model row event]
  (let [{:keys [track details]} (audit.spec/spec model)]
    (if details
      (when-let [extra (details row event)]
        (merge (select-keys row track) extra))
      (select-keys row track))))

(defn- columns-edit?
  "Whether the lifecycle `event` of a model with an audit spec is a create, a delete, or an update that changes a column
  that its spec does not skip."
  [{:keys [model object previous-object]}]
  (or (not (and object previous-object))
      (let [skipped (audit.spec/skipped-columns model)]
        (boolean (some #(and (not (skipped %)) (not (audit.spec/same? model % previous-object object)))
                       (into (set (keys object)) (keys previous-object)))))))

(defn- details-edit-possible?
  "Whether the lifecycle `event` says through its context that details changed beside the columns, for a model whose
  spec stores details, which [[spec-edit?]] then compares."
  [{:keys [model context]}]
  (boolean (and (:details context) (:details (audit.spec/spec model)))))

(defn- maybe-edit?
  "Whether the lifecycle `event` may be a write whose row should say a user made it, which [[spec-edit?]] decides once
  its rows are hydrated, without reading the app DB."
  [{:keys [context] :as event}]
  (and (nil? (:archived-with context))
       (or (columns-edit? event) (details-edit-possible? event))))

(defn- spec-edit?
  "Whether the lifecycle `event` of a model with an audit spec, its rows hydrated, is a write whose row should say a
  user made it: not one that the archive or restore of another entity carried to its row, nor an update that changes
  nothing but the columns that its spec skips, unless the write says through its context that details changed beside
  them."
  [{:keys [model context object previous-object] :as event}]
  (and (nil? (:archived-with context))
       (or (columns-edit? event)
           (and (details-edit-possible? event)
                (not= (details-of model object event) (details-of model previous-object event))))))

(defn- hydrated
  "The row `events` with their rows before and after the writes as the `:hydrate` of the spec of their model leaves
  them, which loads what its `:details` and `:state` read, one call per model and `app-db/delete-partition-size` rows."
  [events]
  (let [slots (for [[i {:keys [model] :as event}] (map-indexed vector events)
                    :when (:hydrate (audit.spec/spec model))
                    k     [:object :previous-object]
                    :when (some? (get event k))]
                [model i k])]
    (reduce (fn [events [model model-slots]]
              (let [hydrate (:hydrate (audit.spec/spec model))
                    rows    (into []
                                  (mapcat (fn [slots] (hydrate (mapv (fn [[_ i k]] (get-in events [i k])) slots))))
                                  (partition-all app-db/delete-partition-size model-slots))]
                (reduce (fn [events [[_ i k] row]] (assoc-in events [i k] row))
                        events
                        (map vector model-slots rows))))
            (vec events)
            (group-by first slots))))

(defn- default-topic
  "The topic of the lifecycle `event`, as it is stored: the one its write function published it under."
  [{:keys [topic]}]
  (some-> topic name keyword))

(defn- stored-topic
  "The topic to store for the lifecycle `event`, nil when it records nothing."
  [{:keys [model operation] :as event}]
  (if-let [topics (:topics (audit.spec/spec model))]
    (let [topic (get topics operation)]
      (if (keyword? topic)
        topic
        (when topic (topic event))))
    (default-topic event)))

(defn- state-of
  "The state that the spec of `model` stores whole for `row`, as the lifecycle `event` leaves it."
  [model row event]
  (when-let [state (:state (audit.spec/spec model))]
    (state row event)))

(defn- event-details
  "The details of the row that the lifecycle `event` records: the changes of an update, or the details of the row, and
  the state of the row, nil when the row no longer exists."
  [{:keys [model object previous-object] :as event}]
  (if (and object (not-empty previous-object))
    (when-let [details (details-of model object event)]
      (merge (audit-log/update-details details (details-of model previous-object event))
             (state-of model object event)))
    (let [row (row-of event)]
      (when-let [details (details-of model row event)]
        (merge details (state-of model row event))))))

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

(defn- event-row
  "The audit row of the lifecycle `event` of a write by the user `user-id`, with `extra` beside its details, nil unless
  its spec stores a topic for it."
  [event user-id extra]
  (when-let [topic (stored-topic event)]
    (when-let [details (event-details event)]
      (let [[model model-id] (subject-of event)]
        (audit-log/audit-row topic {:user-id  user-id
                                    :model    model
                                    :model-id model-id
                                    :details  (merge extra details)})))))

(defn- rolled-roots
  "The audited models whose rows have the writes of other models counted as writes of them."
  []
  (into #{}
        (keep (fn [model]
                (when (audit.spec/parent model)
                  (loop [model model]
                    (if-let [{parent-model :model} (audit.spec/parent model)]
                      (recur parent-model)
                      model)))))
        (audit.spec/audited-models)))

(defn- root-touch?
  "Whether the `event` is the touch of a row that the writes of other models count as writes of, or of a model whose
  spec says that its touch records the row, which records the row as updated."
  [roots {:keys [model] :as event}]
  (and (u.events/touch? event)
       (or (contains? roots model) (= :row (:touch (audit.spec/spec model))))))

(defn- own-rows
  "The rows of the writes of the models that record them as their own, a row whose parts changed being recorded as
  updated by its touch."
  [events roots]
  (let [candidates (filter (fn [{:keys [model user-id] :as event}]
                             (and user-id
                                  (nil? (audit.spec/parent model))
                                  (or (maybe-edit? event) (root-touch? roots event))))
                           events)]
    (for [{:keys [user-id] :as event} (hydrated candidates)
          :when (or (spec-edit? event) (root-touch? roots event))
          :let  [event (cond-> event
                         (and (u.events/touch? event) (= :row (:touch (audit.spec/spec (:model event)))))
                         (dissoc :previous-object))]]
      (event-row event user-id (context-details event)))))

(defn- moment-rows
  "The rows that the spec of a model derives from a column that its writes change."
  [events]
  (let [pairs   (vec (for [{:keys [model operation user-id] :as event} events
                           :when (and user-id (contains? #{:create :update} operation))
                           {applies? :when, :as moment} (:moments (audit.spec/spec model))
                           :when (applies? event)]
                       [event moment]))
        details (reduce (fn [acc [details-fn entries]]
                          (cond-> acc
                            details-fn (into (map vector (map first entries) (details-fn (mapv (comp first second) entries))))))
                        {}
                        (group-by (comp :details second second) (map-indexed vector pairs)))]
    (for [[i [{:keys [user-id] :as event} {moment-topic :topic}]] (map-indexed vector pairs)
          :let [[subject-model subject-id] (subject-of event)]]
      (audit-log/audit-row moment-topic {:user-id  user-id
                                         :model    subject-model
                                         :model-id subject-id
                                         :details  (get details i {})}))))

(defn- record-lifecycle-events!
  "Record the rows of the lifecycle events of the audited models of one event."
  [events]
  (when (premium-features/log-enabled?)
    (audit-log/create-audit-logs! (into []
                                        (remove nil?)
                                        (concat (own-rows events (rolled-roots))
                                                (moment-rows events))))))

(events/derive! :metabase/lifecycle-event ::lifecycle)

(methodical/defmethod events/publish-event! ::lifecycle
  [topic event]
  (when-let [events (not-empty (filterv (fn [{:keys [model]}] (audit.spec/spec model)) (u.events/row-events topic event)))]
    (record-lifecycle-events! events)))

(events/derive! ::dashboard-cards-event ::event)
(events/derive! :event/dashboard-add-cards ::dashboard-cards-event)
(events/derive! :event/dashboard-remove-cards ::dashboard-cards-event)

(methodical/defmethod events/publish-event! ::dashboard-cards-event
  "Record the dashcards that the write of a Dashboard added or removed, with the name and the description of their
  Cards."
  [topic {:keys [object dashcards user-id]}]
  (when (and user-id (premium-features/log-enabled?))
    (let [cards (into {}
                      (map (juxt :id #(select-keys % [:name :description])))
                      (audit-app.db/cards (mapv :card_id dashcards)))]
      (record! topic
               {:details  (-> (select-keys object [:description :name :id])
                              (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                                  (-> (get cards card_id)
                                                      (assoc :id id)
                                                      (assoc :card_id card_id)))))
                :user-id  user-id
                :model    :model/Dashboard
                :model-id (:id object)}))))

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
   :event/test-suite-run-start            [:suite_id :status]
   :event/test-suite-run-timeout          [:suite_id :status]
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
    (let [model  (t2/model object)
          object (if-let [hydrate (:hydrate (audit.spec/spec model))]
                   (first (hydrate [object]))
                   object)]
      (details-of model object {:object object :topic topic}))

    :else
    {}))

(defn- manual-params
  "The params of the audit row of `topic` of a manual action on `object`, the event `params` with what its spec stores
  of `object` in the details."
  [topic object params]
  (assoc params :details (merge (:details params) (manual-details topic object))))

(defn- record-manual!
  "Record the audit row of `topic` and the event `params` of a manual action, with what its spec stores of its object,
  or one row for each of its `:objects`, in one insert, as [[record-each!]] does."
  [topic {:keys [object objects] :as params}]
  (when (premium-features/log-enabled?)
    (if objects
      (record-each! #(audit-log/audit-row topic (manual-params topic % (assoc (dissoc params :objects) :object %)))
                    objects)
      (record! topic (manual-params topic object params)))))

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

(events/derive! ::notification-create-event ::event)
(events/derive! :event/notification-create ::notification-create-event)

(methodical/defmethod events/publish-event! ::notification-create-event
  "Record one row for each Notification that `:objects` (or `:object`) holds, in one insert, as [[record-each!]] does."
  [topic {:keys [object objects user-id]}]
  (when (premium-features/log-enabled?)
    (record-each! (fn [notification]
                    (audit-log/audit-row topic
                                         {:details  (notification-details notification)
                                          :object   notification
                                          :model    :model/Notification
                                          :model-id (:id notification)
                                          :user-id  user-id}))
                  (or objects [object]))))

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
(events/derive! :event/sessions-revoked ::session-event)

(methodical/defmethod events/publish-event! ::session-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::session-revoked-event ::event)
(events/derive! :event/session-revoked ::session-revoked-event)

(methodical/defmethod events/publish-event! ::session-revoked-event
  "Record one row for each User whose sessions `:objects` holds with their `:count`, in one insert, as [[record-each!]]
  does."
  [topic {:keys [user-id details objects]}]
  (when (premium-features/log-enabled?)
    (record-each! (fn [{:keys [id count]}]
                    (audit-log/audit-row topic {:user-id  user-id
                                                :model    :model/User
                                                :model-id id
                                                :details  (assoc details :count count)}))
                  objects)))

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
(events/derive! :event/transform-test-run-start ::transform-event)
(events/derive! :event/transform-test-run-timeout ::transform-event)
(events/derive! :event/transform-inspect-discover ::transform-event)
(events/derive! :event/transform-inspect-lens ::transform-event)

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (record-manual! topic event))

(events/derive! ::transform-run-timeout-event ::event)
(events/derive! :event/transform-run-timeout ::transform-run-timeout-event)

(methodical/defmethod events/publish-event! ::transform-run-timeout-event
  "Record one row for each run that `:objects` (or `:object`) holds, in one insert, as [[record-each!]] does."
  [topic {:keys [object objects user-id]}]
  (when (premium-features/log-enabled?)
    (record-each! (fn [run]
                    (audit-log/audit-row topic
                                         {:details (manual-details topic run)
                                          :object  run
                                          :user-id (or user-id (:user_id run))}))
                  (or objects [object]))))

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

(events/derive! ::test-suite-event ::event)
(events/derive! :event/test-suite-run-start ::test-suite-event)
(events/derive! :event/test-suite-run-timeout ::test-suite-event)

(methodical/defmethod events/publish-event! ::test-suite-event
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
