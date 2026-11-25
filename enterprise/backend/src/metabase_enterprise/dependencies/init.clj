(ns metabase-enterprise.dependencies.init
  (:require
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.models.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error]
   [metabase-enterprise.dependencies.models.analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status]
   [metabase-enterprise.dependencies.models.result-metadata-status]
   [metabase-enterprise.dependencies.schema]
   [metabase-enterprise.dependencies.settings]
   [metabase-enterprise.dependencies.task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata]))
