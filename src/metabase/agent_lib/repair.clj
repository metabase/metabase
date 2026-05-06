(ns metabase.agent-lib.repair
  "Deterministic repair helpers for structured MBQL programs."
  (:require
   [metabase.agent-lib.repair.context]
   [metabase.agent-lib.repair.normalize]
   [potemkin :as p]))

(p/import-vars
 [metabase.agent-lib.repair.normalize repair-program]
 [metabase.agent-lib.repair.context repair-program-for-context])
