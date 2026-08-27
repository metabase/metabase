(ns metabase.run-tracking.core
  "Shared primitives for run-tracking heartbeats and orphan reaping."
  (:require
   [metabase.run-tracking.ops]
   [metabase.run-tracking.task]
   [potemkin :as p]))

(comment metabase.run-tracking.ops/keep-me
         metabase.run-tracking.task/keep-me)

(p/import-vars
 [metabase.run-tracking.ops
  cutoff
  detection-latency-ms
  heartbeat-and-reconcile!
  heartbeat-ids!
  reap-orphaned!
  reap-rows!
  unit->ms]
 [metabase.run-tracking.task
  schedule-reaper!
  start-heartbeat!])
