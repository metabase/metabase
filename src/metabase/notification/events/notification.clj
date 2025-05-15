(ns metabase.notification.events.notification
  (:require
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.actions.types :as actions.types]
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]
   [metabase.notification.send :as notification.send]
   [metabase.task-history.core :as task-history]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics
  #{:event/user-invited
    :event/notification-create
    :event/slack-token-invalid
    :event/row.created
    :event/row.updated
    :event/row.deleted})

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
  (if-let [schema (events/event-schema topic)]
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
          (notification.send/send-notification! (assoc notification :event_info (maybe-hydrate-event-info topic event-info))))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))

(def ^:private table-hydrate
  [:model/Table :name :field_order])

(def ^:private user-hydrate
  "Hydrate user information when sending system event notifications."
  [:model/User :first_name :last_name :email])

(def ^:private table-hydrate-schema [:table {:optional true}
                                     [:map
                                      [:name :string]
                                      [:field_order :keyword]]])

(mr/def ::nano-id ms/NonBlankString)

(def ^:private table-id-hydrate-schemas
  (events/hydrated-schemas [:table_id pos-int?]
                           :table
                           table-hydrate
                           table-hydrate-schema))

(def ^:private actor-schema
  (events/hydrated-schemas [:actor_id {:optional true} [:maybe pos-int?]]
                           :actor user-hydrate
                           [:actor {:optional     true}
                            [:map
                             [:first_name [:maybe :string]]
                             [:last_name  [:maybe :string]]
                             [:email      [:maybe :string]]]]))

(mr/def ::action-events
  (into [:map #_{:closed true}
         [:action :keyword]
         [:invocation_id ::nano-id]]
        actor-schema))

(mr/def :event/action.invoked [:merge ::action-events [:map [:inputs [:sequential :map]]]])
(mr/def :event/action.success [:merge ::action-events [:map [:outputs [:sequential :map]]]])
(mr/def :event/action.failure [:merge ::action-events [:map [:message :string] [:info :map]]])

(def ^:private row-change-schema
  [:map
   [:pk     :any]
   [:before [:maybe :map]]
   [:after  [:maybe :map]]])

(mr/def ::snake-keyed-scope (mu/snake-keyed-schema (mr/resolve-schema ::actions.types/scope.hydrated)))

(def ^:private single-row-schema
  [:map {:closed true}
   [:scope ::snake-keyed-scope]
   [:args (into [:map
                 [:db_id pos-int?]
                 [:timestamp [:fn t/zoned-date-time?]]]
                table-id-hydrate-schemas)]
   [:row_change row-change-schema]])

(def ^:private table-row-schema
  [:map {:closed true}
   [:scope ::snake-keyed-scope]
   [:args (into [:map
                 [:db_id pos-int?]
                 [:timestamp [:fn t/zoned-date-time?]]] table-id-hydrate-schemas)]
   [:row_changes [:sequential [:map
                               [:pk     :any]
                               [:before [:maybe :map]]
                               [:after  [:maybe :map]]]]]])

(def ^:private single-event (into single-row-schema actor-schema))

(mr/def :event/row.created single-event)
(mr/def :event/row.updated single-event)
(mr/def :event/row.deleted single-event)

(def ^:private bulk-event (into table-row-schema actor-schema))

(mr/def :event/rows.created bulk-event)
(mr/def :event/rows.updated bulk-event)
(mr/def :event/rows.deleted bulk-event)
