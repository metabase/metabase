(ns metabase.queries.events.refresh-model-metadata
  (:require
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.queries.db :as queries.db]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/table-fields-added ::event)

(defn- single-table-mbql-model?
  "Whether `model` is an MBQL model that reads only the Table with `table-id`, with no joins in any stage."
  [table-id {query :dataset_query, query-type :query_type}]
  ;; `refresh-metadata` matches columns by name, which is only safe when every column comes from this one Table
  (and (not-empty query)
       (= "query" (name (or query-type "query")))
       (= table-id (lib/primary-source-table-id query))
       (not-any? #(seq (lib/joins query %)) (range (lib/stage-count query)))))

(defn- refresh-model-metadata!
  [table-id model]
  (when (single-table-mbql-model? table-id model)
    (let [old-metadata (:result_metadata model)
          new-metadata (card.metadata/refresh-metadata model {})]
      ;; an empty result means the query could not be inferred; keep the old metadata instead of wiping it. A query or
      ;; metadata that changed since it was read means a user edited the model, and their save owns the metadata.
      (when (and (seq new-metadata)
                 (not= new-metadata old-metadata))
        (queries.db/set-card-result-metadata-if-unchanged! (:id model)
                                                           (select-keys model [:dataset_query :result_metadata])
                                                           new-metadata)))))

(methodical/defmethod events/publish-event! ::event
  "Refresh the result metadata of the single-table models on a Table that sync found new Fields in, so the models show
  the new columns. Never throws, so a failure here cannot stop the sync that published the event."
  [_topic {:keys [table-id]}]
  (try
    (doseq [model (queries.db/unarchived-models-for-table table-id)]
      (try
        (refresh-model-metadata! table-id model)
        (catch Throwable e
          (log/errorf e "Error refreshing result metadata for model %d" (:id model)))))
    (catch Throwable e
      (log/errorf e "Error refreshing result metadata for the models of Table %d" table-id))))
