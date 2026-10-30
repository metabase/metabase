(ns metabase-enterprise.search.entity-retrieval.init
  "Loads the entity-retrieval module's side-effecting namespaces (the background sync task) at
  system startup. See [[metabase-enterprise.core.init]]."
  (:require
   [metabase-enterprise.search.entity-retrieval.health]
   [metabase-enterprise.search.entity-retrieval.task.sync]))
