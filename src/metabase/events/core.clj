(ns metabase.events.core
  (:refer-clojure :exclude [descendants isa?])
  (:require
   [metabase.events.hierarchy]
   [metabase.events.impl]
   [metabase.events.publish]
   [potemkin :as p]))

(comment metabase.events.hierarchy/keep-me
         metabase.events.impl/keep-me
         metabase.events.publish/keep-me)

(p/import-vars
 [metabase.events.hierarchy
  derive!
  descendants
  isa?
  underive!]
 [metabase.events.publish
  context
  create-event
  delete-event
  touch-event
  update-event]
 [metabase.events.impl
  Topic
  event-schema
  object->metadata
  publish-event!])
