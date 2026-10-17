(ns metabase.queries.init
  (:require
   [metabase.queries.events.backfill-model-metadata-on-sync]
   [metabase.queries.events.cards-notification-deleted-on-card-save]
   [metabase.queries.events.refresh-model-metadata]
   [metabase.queries.events.schema]
   ;; for Malli-registered schemas
   [metabase.queries.schema]))
