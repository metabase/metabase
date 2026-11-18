(ns metabase.events.core
  (:refer-clojure :exclude [descendants isa?])
  (:require
   [metabase.events.batch]
   [metabase.events.hierarchy]
   [metabase.events.impl]
   [metabase.events.lifecycle]
   [potemkin :as p]))

(comment metabase.events.batch/keep-me
         metabase.events.lifecycle/keep-me
         metabase.events.hierarchy/keep-me
         metabase.events.impl/keep-me)

(p/import-vars
 [metabase.events.batch
  add-to-sink!
  register-capture!
  register-owned-consumer!
  register-sink!
  register-statement-capture!
  spec
  with-batched-events
  with-event-context]
 [metabase.events.hierarchy
  derive!
  descendants
  isa?
  underive!]
 [metabase.events.impl
  Topic
  event-schema
  object->metadata
  publish-event!])

(metabase.events.batch/set-publisher! (fn [topic event] (publish-event! topic event)))
