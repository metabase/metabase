(ns metabase.events.core
  (:require
   [metabase.events.hierarchy]
   [metabase.events.impl]
   [potemkin :as p]))

(comment metabase.events.hierarchy/keep-me
         metabase.events.impl/keep-me)

(p/import-vars
 [metabase.events.hierarchy
  derive!
  event-descendants
  event-isa?
  underive!]
 [metabase.events.impl
  Topic
  event-schema
  object->metadata
  publish-event!])
