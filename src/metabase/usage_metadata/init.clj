(ns metabase.usage-metadata.init
  (:require
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.settings]
   [metabase.usage-metadata.task.process]))
