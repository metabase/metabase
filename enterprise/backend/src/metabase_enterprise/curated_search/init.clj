(ns metabase-enterprise.curated-search.init
  "Loads the curated-search module's side-effecting namespaces (the background sync task) at
  system startup. See [[metabase-enterprise.core.init]]."
  (:require
   [metabase-enterprise.curated-search.task.sync]))
