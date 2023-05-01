(ns ^{:added "0.47.0"}
 metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks (almost) all actions taken by users across the Metabase
  app. This is a distinct from the Activity and View Log models, which predate this namespace, and which power specific
  API endpoints used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [metabase.events :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as m]
   [toucan2.core :as t2]
   [metabase.util.i18n :refer [tru]]
   [metabase.query-processor :as qp]
   [metabase.util.log :as log]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :refer [Card]]))

(m/defmethod t2/table-name :m/audit-log
  [_model]
  :audit_log)

(defmulti model-details
  "Returns a map with data about an entity that should be included in the `details` column of the Audit Log."
  {:arglists '([entity event-type])}
  mi/dispatch-on-model)

(defmethod model-details :default
  [_entity _event-type]
  {})

(defmethod model-details Card
  [_model {query :dataset_query, dataset? :dataset :as card} _event-type]
  (let [query (when (seq query)
                (try (qp/preprocess query)
                     (catch Throwable e
                       (log/error e (tru "Error preprocessing query:")))))
        database-id (some-> query :database u/the-id)
        table-id    (mbql.u/query->source-table-id query)]
    (merge (select-keys card [:name :description])
           {:database_id database-id
            :table_id    table-id
            ;; Use `model` instead of `dataset` to mirror in-product terminology
            :model dataset?})))

(defn record-event!
  "Record an event in the Audit Log."
  [topic object]
  ;; Push an event to the event queue so that activity table is still populated
  (events/publish-event! topic object)
  (let [details (model-details object topic)]
    (t2/insert! :m/audit-log
                {:topic    topic
                 :details  details
                 :model    (name (t2/model object))
                 :model_id (u/the-id object)})))

(defn- pre-insert [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))

(mi/define-methods
  :m/audit-log
  {:types      (constantly {:details :json, :topic :keyword})
   :pre-insert pre-insert})
