(ns ^:deprecated metabase.pulse.core
  "API namespace for the `metabase.pulse` module.

  This namespace is deprecated, soon everything will be migrated to notifications."
  (:require
   [metabase.pulse.send]
   [potemkin :as p]))

(comment
  metabase.pulse.send/keep-me)

(p/import-vars
 [metabase.pulse.send
  send-pulse!])
