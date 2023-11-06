(ns metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is
  distinct from the Activity and View Log models, which predate this namespace, and which power specific API endpoints
  used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [metabase.api.common :as api]
   [metabase.models.activity :as activity]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
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
  "Given an instance of a model or a keyword model identifier, returns the name to store in the database as a string."
  [model]
  (some-> (or (t2/model model) model) name))

(mu/defn record-event-2!
  "Records an event in the Audit Log.

  `topic` is a keyword representing the type of event being recorded, e.g. `:dashboard-create`. If the keyword is
  namespaced (e.g. `:event/dashboard-create`) the namespace is stripped before the event is recorded.

  `params` is a map that can optionally include the following fields:
  - `:object`: the object the event is acting on, e.g. a `Card` instance
  - `:previous-object`: the previous version of the object, for update events
  - `:user-id`: the user ID that initiated the event (defaults: `api/*current-user-id*`)
  - `:model`: the name of the model the event is acting on, e.g. `:model/Card` or \"Card\" (default: model of `:object`)
  - `:model-id`: the ID of the model the event is acting on (default: ID of `:object`)
  - `:details`: a map of arbitrary details relavent to the event, which is recorded as-is (default: {})

  `:object` and `:previous-object` both have `model-details` called on them to determine which fields should be audited,
  then they are added to `:details` before the event is recorded."
  [topic :- :keyword
   params :- [:map {:closed true}
              [:object          {:optional true} [:maybe :map]]
              [:previous-object {:optional true} [:maybe :map]]
              [:user-id         {:optional true} [:maybe pos-int?]]
              [:model           {:optional true} [:maybe [:or :keyword :string]]]
              [:model-id        {:optional true} [:maybe pos-int?]]
              [:details         {:optional true} [:maybe :map]]]]
  (let [unqualified-topic (keyword (name topic))
        object            (:object params)
        previous-object   (:previous-object params)
        user-id           (or (:user-id params) api/*current-user-id*)
        model             (model-name (or (:model params) object))
        model-id          (or (:model-id params) (u/id object))
        details           (merge
                           {}
                           (:details params)
                           (when object
                             (model-details object unqualified-topic))
                           (when previous-object
                             {:previous-object (model-details previous-object unqualified-topic)}))]
    (t2/insert! :model/AuditLog
                :topic    unqualified-topic
                :details  details
                :model    model
                :model_id model-id
                :user_id  user-id)
    ;; TODO: temporarily double-writing to the `activity` table, delete this in Metabase v48
    ;; TODO figure out set of events to actually continue recording in activity
    (when-not (#{:card-read :dashboard-read :table-read :card-query :setting-update} unqualified-topic)
      (activity/record-activity!
       {:topic    topic
        :object   object
        :details  details
        :model    model
        :model-id model-id
        :user-id  user-id}))))

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
         model-name        (model-name model)
         details           (cond
                             (:raw? object) (dissoc object :raw?)
                             (t2/model object) (model-details object unqualified-topic)
                             :else (or object {}))]
     (t2/insert! :model/AuditLog
                 :topic    unqualified-topic
                 :details  details
                 :model    model-name
                 :model_id model-id
                 :user_id  user-id)
     ;; TODO: temporarily double-writing to the `activity` table, delete this in Metabase v48
     (when-not (#{:card-read :dashboard-read :table-read :card-query :setting-update} unqualified-topic)
      (activity/record-activity!
        {:topic    topic
         :object   object
         :details  details
         :model    model-name
         :model_id model-id
         :user-id  user-id})))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))
