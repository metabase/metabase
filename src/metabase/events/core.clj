(ns metabase.events.core
  (:require
   [metabase.events.impl]
   [potemkin :as p]))

(comment metabase.events.impl/keep-me)

(p/import-vars
 [metabase.events.impl
  event-schema
  object->metadata
  publish-event!])
