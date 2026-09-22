(ns metabase.queries.events.refresh-model-metadata
  (:require
   [metabase.events.core :as events]
   [metabase.queries.db :as queries.db]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/table-fields-added ::event)

(methodical/defmethod events/publish-event! ::event
  "Refresh the result metadata of the models on a Table that sync found new Fields in, so the models show the new
  columns."
  [_topic {:keys [table-id]}]
  (doseq [{:keys [id result_metadata] :as model} (queries.db/unarchived-models-for-table table-id)]
    (try
      (let [metadata (card.metadata/refresh-metadata model {})]
        ;; an empty result means the query could not be inferred; keep the old metadata instead of wiping it
        (when (and (seq metadata)
                   (not= metadata result_metadata))
          (queries.db/set-card-result-metadata! id metadata)))
      (catch Throwable e
        (log/errorf e "Error refreshing result metadata for model %d" id)))))
