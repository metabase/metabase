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
