(ns metabase.exec-log.init
  "Loads the namespaces that must be present for the execution-log stream to work at runtime.

  Required by `metabase.core.init`. Without this, `exec-log-sink` and `exec-log-file` are never registered, so they do
  not appear to an admin and the stream stays off no matter what is configured."
  (:require
   [metabase.exec-log.settings]))
