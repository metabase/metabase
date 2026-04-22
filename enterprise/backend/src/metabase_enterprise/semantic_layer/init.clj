(ns metabase-enterprise.semantic-layer.init
  "Loader for semantic-layer tasks. Required from `metabase-enterprise.core.init` so `task/init!`
  methods are discoverable when the scheduler boots."
  (:require
   [metabase-enterprise.semantic-layer.settings]
   [metabase-enterprise.semantic-layer.task.complexity-score]))
