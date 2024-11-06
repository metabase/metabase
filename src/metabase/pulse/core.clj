(ns metabase.pulse.core
  "API namespace for the `metabase.pulse` module."
  (:require
   [metabase.pulse.send]
   [potemkin :as p]))

(comment
  metabase.pulse.send/keep-me)

(p/import-vars
 [metabase.pulse.send
  defaulted-timezone
  send-pulse!])
