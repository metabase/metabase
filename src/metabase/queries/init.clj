(ns metabase.queries.init
  (:require
   [metabase.queries.events.backfill-model-metadata-on-sync]
   [metabase.queries.events.cards-notification-deleted-on-card-save]
   [metabase.queries.events.schema]
   [metabase.queries.models.card]
   [metabase.queries.models.parameter-card]
   [metabase.queries.models.query]
   [metabase.queries.models.query-execution]
   [metabase.queries.models.query-field]
   [metabase.queries.models.query-table]
   [metabase.queries.models.stored-result]
   [metabase.queries.models.stored-result-use]
   ;; for Malli-registered schemas
   [metabase.queries.schema]))
