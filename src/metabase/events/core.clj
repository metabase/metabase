(ns metabase.events.core
  (:require
   [metabase.events.impl]
   [metabase.events.schema]
   [potemkin :as p]))

(comment metabase.events.impl/keep-me)

(p/import-vars
 [metabase.events.impl
  Topic
  event-schema
  object->metadata
  publish-event!]
 [metabase.events.schema
  hydrated-schemas])
