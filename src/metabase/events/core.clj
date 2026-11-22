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
  Events
  create-event
  created
  delete-changes
  delete-event
  deleted
  publish-lifecycle!
  register-capture!
  register-statement-capture!
  row-events
  touch-event
  update-event
  updated
  updated-row]
 [metabase.events.impl
  Topic
  event-schema
  object->metadata
  publish-event!])
