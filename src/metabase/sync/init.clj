(ns metabase.sync.init
  "Loads namespaces that need to be loaded for side effects on system launch. This namespace is loaded by [[metabase.core.init]].

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.sync.events.sync-database]
   [metabase.sync.task.sync-databases]))
