(ns metabase.tracing.events
  "Registers tracing instrumentation for the event system.
   Loaded by metabase.tracing.init to add span wrapping around event publishing
   without creating a cyclic dependency from events.impl -> tracing.core."
  (:require
   [metabase.events.impl :as events.impl]
   [metabase.tracing.core :as tracing]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(defn- traced-publish-event!
  "Around method that wraps event publishing in a tracing span."
  [next-method topic event]
  (tracing/with-span :events "events.publish" {:event/topic (str topic)}
    (next-method topic event)))

;; Register the tracing around method on the publish-event! multimethod.
;; This uses a unique key so it can be cleanly removed if needed.
(methodical/add-aux-method-with-unique-key!
 #'events.impl/publish-event!
 :around
 :default
 traced-publish-event!
 ::tracing)
