(ns metabase.channel.render.js.renderer
  "Hands callers the static-viz [[metabase.channel.render.js.protocol/StaticVizRenderer]] implementation:
  the in-process GraalVM renderer. Kept behind the protocol so an alternative backend can be slotted in
  without touching the callers ([[metabase.channel.render.js.svg]], [[metabase.channel.render.js.color]])."
  (:require
   [metabase.channel.render.js.graal :as graal]))

(set! *warn-on-reflection* true)

(defn renderer
  "The static-viz renderer."
  []
  (graal/renderer))
