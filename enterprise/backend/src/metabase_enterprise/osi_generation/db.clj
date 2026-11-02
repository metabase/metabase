(ns metabase-enterprise.osi-generation.db
  "Application database queries for OSI generation."
  (:require
   [metabase.app-db.core :as app-db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn raw-contexts
  "Raw OSI context rows for `entity-type` and `entity-ids`."
  [entity-type entity-ids]
  (t2/query {:select [:*]
             :from   [:osi_ai_context]
             :where  [:and [:= :entity_type entity-type] [:in :entity_local_id entity-ids]]}))

(defn update-context!
  "Update OSI contexts matching `conditions` with `changes`, returning the number updated."
  [conditions changes]
  (t2/update! :model/OsiAiContext (into {} conditions) changes))

(defn insert-context-if-absent!
  "Insert `stamp` for the entity if absent, returning `:generated` or `:skipped`."
  [entity-type entity-local-id stamp]
  ;; A savepoint prevents a duplicate-key race from aborting an outer PostgreSQL transaction.
  (app-db/with-conflict-retry
    (if (t2/exists? :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id)
      :skipped
      (do
        (t2/with-transaction [_conn]
          (t2/insert! :model/OsiAiContext (merge stamp {:entity_type entity-type, :entity_local_id entity-local-id})))
        :generated))))

(defn tokens-spent
  "Total tokens logged for `source` since `since`."
  [source since]
  (or (:sum (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                           :from   [:ai_usage_log]
                           :where  [:and [:= :source source] [:>= :created_at since]]}))
      0))

(defn context-count
  "Count contexts, optionally restricted by data source."
  [data-source]
  (if data-source
    (t2/count :model/OsiAiContext :data_source data-source)
    (t2/count :model/OsiAiContext)))

(defn contexts
  "Return context rows with the selected columns."
  [model]
  (t2/select model))

(defn context
  "Find the selected context row for an entity."
  [model entity-type entity-local-id]
  (t2/select-one model :entity_type entity-type :entity_local_id entity-local-id))

(defn update-description!
  "Update the description of one Library entity."
  [model entity-local-id description]
  (t2/update! model :id entity-local-id {:description description}))

(defn generation-runs
  "Return the latest task history rows for the generation task."
  [model task-name]
  (t2/select model :task task-name {:limit 25, :order-by [[:started_at :desc] [:id :desc]]}))

(defn delete-contexts!
  "Delete all AI contexts and return the number deleted."
  []
  (t2/delete! :model/OsiAiContext))

(defn delete-finished-runs!
  "Delete completed task history for the generation task, preserving running rows."
  [task-name]
  (t2/delete! :model/TaskHistory :task task-name :status [:not= :started]))
