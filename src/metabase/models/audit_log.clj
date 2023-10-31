(ns metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is
  distinct from the Activity and View Log models, which predate this namespace, and which power specific API endpoints
  used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [clojure.data :as data]
   [metabase.api.common :as api]
   [metabase.models.activity :as activity]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as m]
   [toucan2.core :as t2]))

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

(defn model-name
  "Given a keyword identifier for a model, returns the name to store in the database"
  [model]
  (some-> model name))

(defn update-event?
  "Returns true when this object represents an _update_. We handle updates differently: we include the updated previous
  and new values in details."
  [event] (:audit-log/previous event))

(defn prepare-update-event-details
  "Return a map with previous and new versions of the updated `object`, _keeping only fields that changed_, and passing
  them through model-details to ellide sensative or noisy details."
  [object unqualified-topic]
  (let [previous                       (:audit-log/previous object)
        new                            (dissoc object :audit-log/previous)
        previous-details               (-> previous (model-details unqualified-topic))
        new-details                    (-> new (model-details unqualified-topic))
        changed-keys                   (let [[old new _both] (data/diff previous-details new-details)]
                                            (distinct (concat (keys old) (keys new))))]
    {:new-value      (select-keys new-details changed-keys)
     :previous-value (select-keys previous-details changed-keys)}))

(defn record-event!
  "Record an event in the Audit Log.

  `topic` is a keyword representing the type of event being recorded, e.g. `:dashboard-create`. If the keyword is
  namespaced (e.g. `:event/dashboard-create`) the namespace is stripped before the event is recorded.

  `object` is typically the object that the event is acting on, e.g. a `Dashboard` instance. The details about the
  object which are recorded are determined by the `model-details` multimethod, which is typically implemented in the
  appropriate model namespace.

  `object` can also be a map of arbitrary details relavent to the event, which is recorded as-is. If the name and/or ID
  of a model are also relevant to the event and should be recorded, they can be passed as fourth and fifth arguments."
  ([topic object]
   (record-event! topic object api/*current-user-id*))

  ([topic object user-id]
   (record-event! topic object user-id (some-> (t2/model object) name)))

  ([topic object user-id model]
   (record-event! topic object user-id model (u/id object)))

  ([topic object user-id model model-id]
   (let [unqualified-topic (keyword (name topic))
         details           (cond
                             (update-event? object) (prepare-update-event-details object unqualified-topic)
                             (t2/model object)      (model-details object unqualified-topic)
                             object                 object
                             :else                  {})
         model-name        (model-name model)]
     (t2/insert! :model/AuditLog
                 :topic    unqualified-topic
                 :details  details
                 :model    model-name
                 :model_id model-id
                 :user_id  user-id)
     ;; TODO: temporarily double-writing to the `activity` table, delete this in Metabase v48
     (when-not (#{:card-read :dashboard-read :table-read :card-query :setting-update} unqualified-topic)
      (activity/record-activity!
       :topic      topic
       :object     object
       :details-fn (fn [_] details)
       :user-id    user-id)))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))
