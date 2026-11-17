(ns metabase.queries.init
  (:require
   [metabase.queries.events.backfill-model-metadata-on-sync]
   [metabase.queries.events.schema]
   ;; for Malli-registered schemas
   [metabase.queries.schema]))
