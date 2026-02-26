(ns metabase-enterprise.replacement.protocols
  (:require
   [potemkin.types :as p.types]))

(p.types/defprotocol+ IRunnerProgress
  (set-total! [this total]
    "Set the total number of items to process (across all phases). Called once.")
  (advance! [this] [this n]
    "Mark n items complete (default 1). Writes progress to DB periodically.")
  (canceled? [this]
    "Returns true if cancellation has been requested.")
  (start-run! [this])
  (succeed-run! [this])
  (fail-run! [this message]))
