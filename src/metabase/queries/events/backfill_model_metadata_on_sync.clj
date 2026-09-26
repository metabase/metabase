(ns metabase.queries.events.backfill-model-metadata-on-sync
  (:require
   [metabase.events.core :as events]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/sync-metadata-end ::event)

(methodical/defmethod events/publish-event! ::event
  "After a metadata sync of a Database, infer the metadata of its models that were stored untyped because their
  fields were not synced yet."
  [_topic {database-id :database_id}]
  (try
    (card.metadata/backfill-untyped-model-metadata! database-id)
    (catch Throwable e
      (log/errorf e "Error inferring untyped model metadata for Database %d" database-id))))
