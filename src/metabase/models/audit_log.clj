(ns metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is a
  distinct from the Activity and View Log models, which predate this namespace, and which power specific API endpoints
  used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [toucan2.core :as t2]
   [metabase.models.activity :as activity]))

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
  "Record an event in the Audit Log."
  [topic object]
  (let [details (model-details object topic)]
    (t2/insert! :model/AuditLog
                {:topic    (name topic)
                 :details  details
                 :model    (name (t2/model object))
                 :model_id (u/the-id object)})
    ;; TODO: temporarily double-writing to the `activity` table; remove in v49
    (activity/record-activity!
     :topic      topic
     :object     object
     :details-fn (fn [_] details)
     :user-id    api/*current-user-id*)))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}
                  :user_id   api/*current-user-id*}]
    (merge defaults activity)))
