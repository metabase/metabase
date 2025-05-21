(ns metabase.server.init
  (:require
   ;; this namespace is required for side effects since it has the JSON encoder definitions for `java.time` classes and
   ;; other things we need for `:json` settings
   [metabase.server.middleware.json]
   [metabase.server.settings]))
