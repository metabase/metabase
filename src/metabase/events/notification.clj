;; TODO: move this to metabase.notification.events
(ns metabase.events.notification
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.events :as events]
   [metabase.events.schema :as events.schema]
   [metabase.lib.schema.common :as common]
   [metabase.models.task-history :as task-history]
   [metabase.notification.core :as notification]
   [metabase.notification.models :as models.notification]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics
  #{:event/user-invited
    :event/notification-create
    :event/slack-token-invalid
    :event/action.success})

(def ^:private hydrate-transformer
  (mtx/transformer
   {:decoders {:map {:compile (fn [schema _]
                                (let [hydrates (into {}
                                                     (keep (fn [[k {:keys [hydrate] :as _p} _v]]
                                                             (when hydrate
                                                               [k hydrate])))
                                                     (mc/children schema))]
                                  (when (seq hydrates)
                                    (fn [x]
                                      (if (map? x)
                                        (reduce-kv
                                         (fn [acc k {:keys [key model] :as _hydrate-prop}]
                                           (assoc acc key (when-let [id (get x k)] (t2/select-one model id))))
                                         x
                                         hydrates)
                                        x)))))}}}))

(defn- hydrate!
  "Given a schema and value, hydrate the keys that are marked as to-hydrate.
  Hydrated keys have the :hydrate properties that can be added by [[metabase.events.schema/hydrated-schemas]].

    (hydrate! [:map
                [:user_id {:hydrate {:key :user
                                     :model [:model/User :email]}} :int]]
              {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [schema value]
  (mc/decode schema value hydrate-transformer))

(defn maybe-hydrate-event-info
  "Hydrate event-info if the topic has a schema."
  [topic event-info]
  (if-let [schema (events/event-schema topic event-info)]
    (if (map? event-info)
      (hydrate! schema event-info)
      event-info)
    event-info))

(defmulti notification-filter-for-topic
  "Given an event info, return additional honeysql filters for notification if needed."
  {:arglists '([topic event-info])}
  (fn [topic _event-info]
    topic))

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic event-info]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic (notification-filter-for-topic topic event-info))))

(def ^:dynamic *skip-sending-notification?*
  "Used as a hack for when we need to skip sending notifications for certain events.

  It's an escape hatch until we implement conditional notifications."
  false)

(defmethod notification-filter-for-topic :default [_ _]
  nil)

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-not *skip-sending-notification?*
    (when-let [notifications (t2/hydrate (notifications-for-topic topic event-info) :payload)]
      (task-history/with-task-history {:task         "notification-trigger"
                                       :task_details {:trigger_type     :notification-subscription/system-event
                                                      :event_name       topic
                                                      :notification_ids (map :id notifications)}}
        (log/debugf "Found %d notifications for event: %s" (count notifications) topic)
        (doseq [notification notifications]
          (notification/send-notification! (assoc notification :event_info (maybe-hydrate-event-info topic event-info))))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))

(def ^:private table-hydrate
  [:model/Table :name])

(def ^:private table-hydrate-schema [:table {:optional true}
                                     [:map
                                      [:name
                                       {:description "The name of the table"
                                        :gen/return "orders"}
                                       :string]]])

(mr/def ::nano-id ::common/non-blank-string)

(def ^:private table-id-hydrate-schemas
  (events.schema/hydrated-schemas [:table_id pos-int?]
                                  :table
                                  table-hydrate
                                  table-hydrate-schema))

(mr/def ::action-events
  (-> [:map #_{:closed true}
       [:action :keyword]
       [:invocation_id {:description "The unique identifier for the action invocation"} ::nano-id]]
      (into (events.schema/hydrated-schemas [:actor_id {:optional true} [:maybe pos-int?]]
                                            :actor events.schema/user-hydrate
                                            [:actor {:optional     true
                                                     :description  "The user who performed the action"}
                                             [:map {:gen/return {:first_name "Meta"
                                                                 :last_name  "Bot"
                                                                 :email      "bot@metabase.com"}}
                                              [:first_name [:maybe :string]]
                                              [:last_name  [:maybe :string]]
                                              [:email      [:maybe :string]]]]))))

(mr/def :event/action.invoked [:merge ::action-events [:map [:args :map]]])

(mr/def :event/action.success.row-create [:merge ::action-events
                                          [:map
                                           [:action [:= :row/create]]
                                           [:result
                                            (-> [:map [:created_row {:gen/return {:id 1
                                                                                  :name "this is an example"}
                                                                     :description "The created row, actual keys will vary based on the table"}
                                                       :map]]
                                                (into table-id-hydrate-schemas))]]])

(mr/def :event/action.success.row-update [:merge ::action-events
                                          [:map
                                           [:action [:= :row/update]]
                                           [:result
                                            (-> [:map
                                                 [:raw_update {:gen/return {:id 1
                                                                            :name "New Name"}
                                                               :description "The raw update, actual keys will vary based on the table"} [:maybe :map]]
                                                 [:after  {:gen/return {:id 2
                                                                        :name "New Name"}
                                                           :description "The after state, actual keys will vary based on the table"} [:maybe :map]]
                                                 [:before {:gen/return {:id 2
                                                                        :name "Old Name"}
                                                           :description "The before state, actual keys will vary based on the table"} [:maybe :map]]]
                                                (into table-id-hydrate-schemas))]]])

(mr/def :event/action.success.row-delete [:merge ::action-events
                                          [:map
                                           [:action [:= :row/delete]]
                                           [:result
                                            (-> [:map
                                                 [:deleted_row {:gen/return {:id 1
                                                                             :name "this is an example"}
                                                                :description "The deleted row, actual keys will vary based on the table"}
                                                  :map]]
                                                (into table-id-hydrate-schemas))]]])

(mr/def :event/action.failure [:merge ::action-events [:map [:info :map]]])

(defmethod events/event-schema :event/action.success
  [_topic {:keys [action]}]
  (mr/resolve-schema (case action
                       :row/create :event/action.success.row-create
                       :row/update :event/action.success.row-update
                       :row/delete :event/action.success.row-delete
                       ::action-events)))
