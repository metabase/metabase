(ns metabase-enterprise.entity-retrieval.init
  "Loads the entity-retrieval module's side-effecting namespaces (the background sync task and settings)
  at system startup. See [[metabase-enterprise.core.init]]."
  (:require
   [metabase-enterprise.entity-retrieval.settings]
   [metabase-enterprise.entity-retrieval.task.sync]))
