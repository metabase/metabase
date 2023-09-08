(ns metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is a
  distinct from the Activity and View Log models, which predate this namespace, and which power specific API endpoints
  used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [metabase.api.common :as api]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.activity :as activity]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
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

;; This is in this namespace instead of `metabase.models.card` to avoid circular dependencies with
;; `metabase.query-processor`
(defmethod model-details Card
  [{query :dataset_query, dataset? :dataset :as card} _event-type]
  (let [query (when (seq query)
                (try (qp/preprocess query)
                     (catch Throwable e
                       (log/error e (tru "Error preprocessing query:")))))
        database-id (some-> query :database u/the-id)
        table-id    (mbql.u/query->source-table-id query)]
    (merge (select-keys card [:name :description])
           {:database_id database-id
            :table_id    table-id
            ;; Use `model` instead of `dataset` to mirror product terminology
            :model?      dataset?})))

(defn record-event!
  "Record an event in the Audit Log.

  `topic` is a keyword representing the type of event being recorded, e.g. `:dashboard-create`. If the keyword is
  namespaced (e.g. `:event/dashboard-create`) the namespace is stripped before the event is recorded.

  `object` is typically the object that the event is acting on, e.g. a `Dashboard` instance. The details about the
  object which are recorded are determined by the `model-details` multimethod, which is typically implemented in the
  appropriate model namespace.

  `object` can also be a map of arbitrary details relavent to the event, which is recorded as-is. If the name and/or ID
  of a model are also relevant to the event and should be recorded, they can be passed as third and fourth arguments."
  ([topic object]
   (record-event! topic object (some-> (t2/model object) name)))

  ([topic object model]
   (record-event! topic object model (u/id object)))

  ([topic object model model-id]
   (let [unqualified-topic (keyword (name topic))
         model-name        (some-> model name)
         details           (if (t2/model object)
                             (model-details object unqualified-topic)
                             (or object {}))]
     (t2/insert! :model/AuditLog
                 :topic    unqualified-topic
                 :details  details
                 :model    model-name
                 :model_id model-id)
     ;; TODO: temporarily double-writing to the `activity` table
     (activity/record-activity!
      :topic      topic
      :object     object
      :details-fn (fn [_] details)
      :user-id    api/*current-user-id*))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}
                  :user_id   api/*current-user-id*}]
    (merge defaults activity)))
