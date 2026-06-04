(ns metabase-enterprise.semantic-layer-search.init
  "Loads the semantic-layer-search module's side-effecting namespaces (the background sync task) at
  system startup. See [[metabase-enterprise.core.init]]."
  (:require
   [metabase-enterprise.semantic-layer-search.task.sync]))
