(ns metabase.audit-app.models.audit-log
  "Model definition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is
  distinct from the View Log model, which predates this namespace, and which powers specific API endpoints used for
  in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doto :model/AuditLog
  (derive :metabase/model))

(m/defmethod t2/table-name :model/AuditLog
  [_model]
  :audit_log)

(t2/deftransforms :model/AuditLog
  {:topic   mi/transform-keyword
   :details mi/transform-json})

(defmulti model-details
  "Returns a map with data about an entity that should be included in the `details` column of the Audit Log."
  {:arglists '([entity event-type])}
  mi/dispatch-on-model)

(defmethod model-details :default
  [_entity _event-type]
  {})

(defmethod model-details :model/ApiKey
  [entity _event-type]
  (select-keys entity [:name :group :key_prefix :user_id]))

(defmethod model-details :model/Card
  [{card-type :type, :as card} _event-type]
  (merge (select-keys card [:name :description :database_id :table_id])
          ;; Use `model` instead of `dataset` to mirror product terminology
         {:model? (= (keyword card-type) :model)}))

(defmethod model-details :model/Channel
  [channel _event-type]
  (select-keys channel [:id :name :description :type :active]))

(defmethod model-details :model/Dashboard
  [dashboard event-type]
  (case event-type
    (:dashboard-create :dashboard-delete :dashboard-read)
    (select-keys dashboard [:description :name])

    (:dashboard-add-cards :dashboard-remove-cards)
    (-> (select-keys dashboard [:description :name :parameters :dashcards])
        (update :dashcards (fn [dashcards]
                             (for [{:keys [id card_id]} dashcards]
                               (-> (t2/select-one [:model/Card :name :description :card_schema], :id card_id)
                                   (assoc :id id)
                                   (assoc :card_id card_id))))))

    {}))

(defmethod model-details :model/Database
  [database _event-type]
  (select-keys database [:id :name :engine]))

(defmethod model-details :model/Table
  [table _event-type]
  (select-keys table [:id :name :db_id]))

(defmethod model-details :model/User
  [entity event-type]
  (case event-type
    :user-update               (select-keys (t2/hydrate entity :user_group_memberships)
                                            [:groups :first_name :last_name :email
                                             :invite_method :sso_source
                                             :user_group_memberships :tenant_id])
    :user-invited              (select-keys (t2/hydrate entity :user_group_memberships)
                                            [:groups :first_name :last_name :email
                                             :invite_method :sso_source
                                             :user_group_memberships :tenant_id])
    :password-reset-initiated  (select-keys entity [:token])
    :password-reset-successful (select-keys entity [:token])
    {}))

(defmethod model-details :model/PermissionsGroup
  [permissions-group _event-type]
  (select-keys permissions-group [:id :name :is_tenant_group :magic_group_type]))

(defmethod model-details :model/PermissionsGroupMembership
  [membership _event-type]
  (select-keys membership [:id :user_id :group_id :is_group_manager]))

(defmethod model-details :model/Notification
  [{:keys [subscriptions handlers] :as fully-hydrated-notification} _event-type]
  (merge
   (select-keys fully-hydrated-notification [:id :payload_type :payload_id :creator_id :active])
   {:subscriptions (map #(dissoc % :id :created_at) subscriptions)
    :handlers      (map (fn [handler]
                          (merge (select-keys [:id :channel_type :channel_id :template_id :active]
                                              handler)
                                 {:recipients (map #(select-keys % [:id :type :user_id :permissions_group_id :details])
                                                   (:recipients handler))}))
                        handlers)}))

(defmethod model-details :model/Segment
  [metric _event-type]
  (let [table-id (:table_id metric)
        db-id    (when table-id
                   (t2/select-one-fn :db_id :model/Table, :id table-id))]
    (assoc
     (select-keys metric [:name :description :revision_message])
     :table_id    table-id
     :database_id db-id)))

(defmethod model-details :model/Document
  [document _event-type]
  (select-keys document [:name :collection_id]))

(defmethod model-details :model/Comment
  [comment _event-type]
  (select-keys comment [:target_type :target_id :child_target_id :parent_comment_id]))

(defmethod model-details :model/Transform
  [{:keys [source] :as transform} _event-type]
  (merge (select-keys transform [:name :description :target :run_trigger])
         {:source
          (-> source
              (dissoc :body)
              (update :query #(select-keys % [:database])))}))

(defmethod model-details :model/TransformRun
  [transform-run _event-type]
  (select-keys transform-run [:transform_id :status :run_method]))

(defmethod model-details :model/Glossary
  [glossary _event-type]
  (select-keys glossary [:term]))

(defmethod model-details :model/RemoteSyncTask
  [task _event-type]
  (select-keys task [:sync_task_type :version]))

(def ^:private model-name->audit-logged-name
  {"RootCollection" "Collection"})

(defn model-name
  "Given an instance of a model or a keyword model identifier, returns the name to store in the database as a string, or `nil` if it cannot be computed."
  [instance-or-model]
  (let [model (or (t2/model instance-or-model) instance-or-model)
        raw-model-name (cond
                         (keyword? model) (name model)
                         (class? model) (.getSimpleName ^java.lang.Class model))]
    (model-name->audit-logged-name raw-model-name raw-model-name)))

(defn- prepare-update-event-data
  "Returns a map with previous and new versions of the objects, _keeping only fields that are present in both
  but have changed values_."
  [object previous-object]
  (let [[previous-only new-only _both] (data/diff previous-object object)
        shared-updated-keys (set/intersection (set (keys previous-only)) (set (keys new-only)))]
    {:previous (select-keys previous-object shared-updated-keys)
     :new (select-keys object shared-updated-keys)}))

(mr/def ::event-params [:map {:closed true
                              :doc "Used when inserting a value to the Audit Log."}
                        [:object           {:optional true} [:maybe :map]]
                        [:previous-object  {:optional true} [:maybe :map]]
                        [:user-id          {:optional true} [:maybe pos-int?]]
                        [:model            {:optional true} [:maybe [:or :keyword :string]]]
                        [:model-id         {:optional true} [:maybe pos-int?]]
                        [:details          {:optional true} [:maybe :map]]
                        [:details-changed? {:optional true} [:maybe :boolean]]])

(mu/defn construct-event
  :- [:map
      [:unqualified-topic simple-keyword?]
      [:user-id [:maybe ms/PositiveInt]]
      [:model-name [:maybe :string]]
      [:model-id [:maybe ms/PositiveInt]]
      [:details :map]]
  "Generates the data to be recorded in the Audit Log."
  ([topic :- :keyword
    params :- ::event-params
    current-user-id :- [:maybe pos-int?]]
   (let [unqualified-topic (keyword (name topic))
         object            (:object params)
         previous-object   (:previous-object params)
         object-details    (model-details object unqualified-topic)
         previous-details  (model-details previous-object unqualified-topic)]
     {:unqualified-topic unqualified-topic
      :user-id           (or (:user-id params) current-user-id)
      :model-name        (model-name (or (:model params) object))
      :model-id          (or (:model-id params) (u/id object))
      :details           (merge {}
                                (:details params)
                                (if (not-empty previous-object)
                                  (prepare-update-event-data object-details previous-details)
                                  object-details))})))

(mu/defn record-event!
  "Records an event in the Audit Log.

  `topic` is a keyword representing the type of event being recorded, e.g. `:dashboard-create`. If the keyword is
  namespaced (e.g. `:event/dashboard-create`) the namespace is stripped before the event is recorded.

  `params` is a map that can optionally include the following fields:
  - `:object`: the object the event is acting on, e.g. a `Card` instance
  - `:previous-object`: the previous version of the object, for update events
  - `:user-id`: the user ID that initiated the event (defaults: `api/*current-user-id*`)
  - `:model`: the name of the model the event is acting on, e.g. `:model/Card` or \"Card\" (default: model of `:object`)
  - `:model-id`: the ID of the model the event is acting on (default: ID of `:object`)
  - `:details`: a map of arbitrary details relevant to the event, which is recorded as-is (default: {})

  `:object` and `:previous-object` both have `model-details` called on them to determine which fields should be audited,
  then they are added to `:details` before the event is recorded. `:previous-object` is only included if any audited fields
  were updated.

  Under certain conditions this function does _not_ insert anything into the audit log.
  - If nothing is logged, returns nil
  - Otherwise, returns the audit logged row."
  [topic :- :keyword
   params :- ::event-params]
  (when (premium-features/log-enabled?)
    (span/with-span!
      {:name       "record-event!"
       :attributes (cond-> {}
                     (:model-id params) (assoc :model/id (:model-id params))
                     (:user-id params) (assoc :user/id (:user-id params))
                     (:model params) (assoc :model/name (u/lower-case-en (:model params))))}
      (let [{:keys [user-id model-name model-id details unqualified-topic]}
            (construct-event topic params api/*current-user-id*)]
        (t2/insert! :model/AuditLog
                    :topic    unqualified-topic
                    :details  details
                    :model    model-name
                    :model_id model-id
                    :user_id  user-id)))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))
