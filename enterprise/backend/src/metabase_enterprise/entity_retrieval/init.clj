(ns metabase-enterprise.entity-retrieval.init
  "Loads the entity-retrieval module's side-effecting namespaces (the background sync task) at
  system startup. See [[metabase-enterprise.core.init]]."
  (:require
   [metabase-enterprise.entity-retrieval.health]
   [metabase-enterprise.entity-retrieval.task.sync]))
