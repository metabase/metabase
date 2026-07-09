(ns metabase.channel.render.js.renderer
  "Hands callers the static-viz [[metabase.channel.render.js.protocol/StaticVizRenderer]] implementation
  for the configured [[metabase.channel.settings/static-viz-mode]]: the in-process GraalVM renderer
  (default) or a pool of external Node.js processes. Kept behind the protocol so the callers
  ([[metabase.channel.render.js.svg]], [[metabase.channel.render.js.color]]) don't care which backend
  runs."
  (:require
   [metabase.channel.render.js.graal :as graal]
   [metabase.channel.render.js.node :as node]
   [metabase.channel.settings :as channel.settings]))

(set! *warn-on-reflection* true)

(defn renderer
  "The static-viz renderer for the configured mode."
  []
  (if (= :node (channel.settings/static-viz-mode))
    (node/renderer)
    (graal/renderer)))
